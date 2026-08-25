#include <unistd.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cassert>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <limits>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include "linuxcnc_grpc/command_coordinator.hpp"
#include "linuxcnc_grpc/hal/value_telemetry.hpp"
#include "linuxcnc_grpc/position/history.hpp"
#include "linuxcnc_grpc/program/workspace.hpp"
#include "linuxcnc_grpc/scope/manager.hpp"
#include "linuxcnc_grpc/status_hub.hpp"

namespace fs = std::filesystem;
using namespace linuxcnc::server;

namespace {

class Gate {
 public:
  void arrive() {
    {
      std::lock_guard lock(mutex_);
      arrived_ = true;
    }
    condition_.notify_all();
  }

  void wait_for_arrival() {
    std::unique_lock lock(mutex_);
    condition_.wait(lock, [this] { return arrived_; });
  }

  void open() {
    {
      std::lock_guard lock(mutex_);
      open_ = true;
    }
    condition_.notify_all();
  }

  void wait_until_open() {
    std::unique_lock lock(mutex_);
    condition_.wait(lock, [this] { return open_; });
  }

 private:
  std::mutex mutex_;
  std::condition_variable condition_;
  bool arrived_ = false;
  bool open_ = false;
};

void command_queue_bounds_and_wait_test() {
  CommandCoordinator coordinator(2);
  Gate first_action;
  auto first = coordinator.submit([&] {
    first_action.arrive();
    first_action.wait_until_open();
  });
  first_action.wait_for_arrival();

  // The first item is in flight, so exactly two more items fit in the queue.
  const auto second = coordinator.submit([] {});
  const auto third = coordinator.submit([] {});
  assert(coordinator.queued() == 2);
  bool full = false;
  try {
    (void)coordinator.submit([] {});
  } catch (const std::runtime_error& error) {
    full = std::string(error.what()) == "command queue is full";
  }
  assert(full);
  assert(first.sequence() == 1);
  assert(second.sequence() == 2);
  assert(third.sequence() == 3);

  CommandResult result;
  assert(!first.wait_for(CommandWaitPolicy::Accepted,
                         std::chrono::milliseconds(1), &result));
  assert(result.state == CommandState::Queued);
  first_action.open();
  assert(first.wait_for(CommandWaitPolicy::Accepted, std::chrono::seconds(1),
                        &result));
  assert(result.state == CommandState::Accepted ||
         result.state == CommandState::Completed);
  assert(first.wait_for(std::chrono::seconds(1), &result));
  assert(result.state == CommandState::Completed);
  assert(second.wait_for(std::chrono::seconds(1), &result));
  assert(result.state == CommandState::Completed);
  assert(third.wait_for(std::chrono::seconds(1), &result));
  assert(result.state == CommandState::Completed);
  assert(coordinator.queued() == 0);
  coordinator.shutdown();

  bool stopped = false;
  try {
    (void)coordinator.submit([] {});
  } catch (const std::runtime_error& error) {
    stopped = std::string(error.what()) == "command coordinator is stopped";
  }
  assert(stopped);
}

void command_cancellation_and_acceptance_test() {
  CommandCoordinator coordinator(1);
  Gate action;
  std::atomic<bool> cancellation_seen{false};
  auto ticket = coordinator.submit_with_context(
      [&](CommandContext& context) {
        cancellation_seen = context.cancelled && context.cancelled();
        action.arrive();
        context.mark_accepted(101);
        action.wait_until_open();
      },
      [] { return true; });
  action.wait_for_arrival();

  CommandResult result;
  assert(ticket.wait_for(CommandWaitPolicy::Accepted, std::chrono::seconds(1),
                         &result));
  assert(result.state == CommandState::Accepted);
  assert(result.accepted_sequence == 101);
  assert(cancellation_seen.load());
  assert(!ticket.wait_for(CommandWaitPolicy::Completed,
                          std::chrono::milliseconds(1), &result));
  assert(result.state == CommandState::Accepted);

  // Cancellation belongs to the waiting RPC; it must not remove queued work.
  action.open();
  assert(ticket.wait_for(std::chrono::seconds(1), &result));
  assert(result.state == CommandState::Completed);
  coordinator.shutdown();
}

void command_cancellation_before_worker_start_test() {
  CommandCoordinator coordinator(2);
  Gate blocker;
  auto first = coordinator.submit([&] {
    blocker.arrive();
    blocker.wait_until_open();
  });
  blocker.wait_for_arrival();
  std::atomic<bool> cancelled{true};
  std::atomic<bool> observed{false};
  auto queued = coordinator.submit_with_context(
      [&](CommandContext& context) {
        observed = context.cancelled && context.cancelled();
        context.mark_accepted(202);
      },
      [&] { return cancelled.load(); });
  blocker.open();
  CommandResult result;
  assert(first.wait_for(std::chrono::seconds(1), &result));
  assert(queued.wait_for(std::chrono::seconds(1), &result));
  assert(observed.load());
  assert(result.state == CommandState::Completed);
  coordinator.shutdown();
}

void command_failure_wait_test() {
  CommandCoordinator coordinator(1);
  const auto ticket =
      coordinator.submit([] { throw std::runtime_error("synthetic failure"); });
  CommandResult result;
  assert(ticket.wait_for(std::chrono::seconds(1), &result));
  assert(result.state == CommandState::Failed);
  assert(result.error == "synthetic failure");
  assert(ticket.wait().state == CommandState::Failed);
  coordinator.shutdown();
}

void status_replay_rollover_test() {
  StatusHub hub(2);
  assert(hub.publish({StatusField{1, std::int32_t{10}},
                      StatusField{2, std::string("cold")}}) == 1);
  assert(hub.publish({StatusField{1, std::int32_t{11}}}) == 2);
  assert(hub.publish({StatusField{3, true}}) == 3);

  const auto replay_from_one = hub.replay_after(1);
  assert(!replay_from_one.snapshot_required);
  assert(replay_from_one.deltas.size() == 2);
  assert(replay_from_one.deltas[0].sequence == 2);
  assert(replay_from_one.deltas[1].sequence == 3);
  assert(std::get<std::int32_t>(replay_from_one.deltas[0].fields[0].value) ==
         11);

  const auto replay_from_two = hub.replay_after(2);
  assert(!replay_from_two.snapshot_required);
  assert(replay_from_two.deltas.size() == 1);
  assert(replay_from_two.deltas.front().sequence == 3);
  assert(std::get<bool>(replay_from_two.deltas.front().fields.front().value));
  assert(hub.replay_after(3).deltas.empty());

  // Sequence zero has fallen out of the two-delta replay window.
  const auto rolled = hub.replay_after(0);
  assert(rolled.snapshot_required);
  assert(rolled.snapshot.sequence == 3);
  assert(rolled.snapshot.fields.size() == 3);
  assert(std::get<std::int32_t>(rolled.snapshot.fields[0].value) == 11);

  hub.replace_snapshot({StatusField{9, std::string("replacement")}});
  const auto replacement = hub.replay_after(3);
  assert(replacement.snapshot_required);
  assert(replacement.snapshot.sequence == 4);
  assert(replacement.snapshot.fields.size() == 1);
  assert(replacement.deltas.empty());
}

PositionSample position(double x, std::int32_t motion = 0) {
  PositionSample sample;
  sample.coordinates[0] = x;
  sample.motion_type = motion;
  return sample;
}

PositionSample position_xy(double x, double y, std::int32_t motion = 0) {
  auto sample = position(x, motion);
  sample.coordinates[1] = y;
  return sample;
}

void position_cursor_generation_and_replacement_test() {
  PositionHistory history(2, 0.1);
  assert(history.next_sequence() == 0);
  assert(history.append(position(1.0)));
  auto near_duplicate = position(1.05);
  assert(!history.append(near_duplicate));
  near_duplicate.motion_type = 7;
  assert(history.append(near_duplicate));
  assert(history.append(position(3.0)));
  assert(history.size() == 2);

  const auto initial = history.snapshot();
  assert(initial.reset);
  assert(initial.generation == 1);
  assert(initial.first_sequence == 1);
  assert(initial.next_sequence == 3);
  assert(initial.packed.size() == 2 * kPositionStride);
  assert(initial.packed[0] == 1.05);
  assert(initial.packed[kPositionStride] == 3.0);

  const auto rolled = history.since(0);
  assert(rolled.reset);
  assert(rolled.packed.size() == 2 * kPositionStride);
  const auto bounded = history.since(1, 1);
  assert(!bounded.reset);
  assert(bounded.packed.size() == kPositionStride);
  assert(bounded.packed[0] == 1.05);
  assert(history.since(history.next_sequence()).packed.empty());

  const auto old_generation = initial.generation;
  history.configure(1);
  const auto configured = history.snapshot();
  assert(configured.generation != old_generation);
  assert(configured.first_sequence == 2);
  assert(configured.packed.size() == kPositionStride);
  assert(history.since(configured.first_sequence, 0, old_generation).reset);

  history.clear();
  const auto cleared = history.snapshot();
  assert(cleared.reset);
  assert(cleared.generation != configured.generation);
  assert(cleared.first_sequence == cleared.next_sequence);
  assert(cleared.packed.empty());
  assert(history.since(history.next_sequence(), 0, cleared.generation)
             .packed.empty());

  PositionHistory non_finite_history(8);
  auto finite = position(1.0);
  auto invalid = finite;
  invalid.coordinates[0] = std::numeric_limits<double>::quiet_NaN();
  assert(non_finite_history.append(finite));
  assert(non_finite_history.append(invalid));
  assert(!non_finite_history.append(invalid));
  assert(non_finite_history.append(finite));
}

void position_collinear_compaction_test() {
  PositionHistory straight(16);
  assert(straight.append(position(0.0)));
  assert(straight.append(position(1.0)));
  assert(straight.append(position(2.0)));
  assert(straight.size() == 2);
  const auto compacted = straight.snapshot();
  assert(compacted.next_sequence == 3);
  assert(compacted.packed.size() == 2 * kPositionStride);
  assert(compacted.packed[0] == 0.0);
  assert(compacted.packed[kPositionStride] == 2.0);

  // A consumer that saw the old tail removes it before appending the new
  // endpoint. A consumer that never saw that intermediate point only appends.
  const auto seen_tail = straight.since(2);
  assert(!seen_tail.reset);
  assert(seen_tail.replace_count == 1);
  assert(seen_tail.next_sequence == 3);
  assert(seen_tail.packed.size() == kPositionStride);
  assert(seen_tail.packed[0] == 2.0);
  const auto unseen_tail = straight.since(1);
  assert(unseen_tail.replace_count == 0);
  assert(unseen_tail.packed.size() == kPositionStride);

  PositionHistory coalesced(16);
  assert(coalesced.append(position_xy(0.0, 0.0)));
  assert(coalesced.append(position_xy(1.0, 0.0)));
  assert(coalesced.append(position_xy(1.0, 1.0)));
  assert(coalesced.append(position_xy(1.0, 2.0)));
  const auto before_intermediate = coalesced.since(2);
  assert(before_intermediate.replace_count == 0);
  assert(before_intermediate.packed.size() == kPositionStride);
  assert(before_intermediate.packed[1] == 2.0);
  const auto after_intermediate = coalesced.since(3);
  assert(after_intermediate.replace_count == 1);
  assert(after_intermediate.packed.size() == kPositionStride);

  PositionHistory corner(16);
  assert(corner.append(position_xy(0.0, 0.0)));
  assert(corner.append(position_xy(1.0, 0.0)));
  assert(corner.append(position_xy(1.0, 1.0)));
  assert(corner.size() == 3);

  PositionHistory arc(256);
  for (int step = 0; step <= 100; ++step) {
    const double angle = static_cast<double>(step) * 0.01;
    assert(arc.append(position_xy(std::cos(angle), std::sin(angle), 3)));
  }
  assert(arc.size() > 2);
  assert(arc.size() < 101);
}

void hal_value_telemetry_test() {
  HalValueTelemetry telemetry(2);
  std::vector<HalTelemetryResolvedItem> items{
      {{HalTelemetryItemKind::Pin, "test.bit"}, HalTelemetryType::Bit},
      {{HalTelemetryItemKind::Signal, "test.u64"}, HalTelemetryType::U64}};
  const auto created = telemetry.create(items, std::chrono::milliseconds(50));
  assert(created && created->revision == 1 && created->bindings.size() == 2);
  const auto token = created->websocket_path.substr(
      created->websocket_path.find_last_of('/') + 1);
  const auto claimed = telemetry.claim(token);
  assert(claimed && *claimed == created->subscription_id);
  assert(!telemetry.claim(token));
  const auto due = telemetry.due(std::chrono::steady_clock::now());
  assert(due.size() == 1 && due[0].bindings.size() == 2);
  telemetry.publish(created->subscription_id, 1,
                    {HalTelemetryValue{true},
                     HalTelemetryValue{std::uint64_t{0xffffffffffffffffULL}}});
  const auto snapshot = telemetry.snapshot(created->subscription_id);
  assert(snapshot && snapshot->sampled && snapshot->sequence == 1);
  std::vector<HalTelemetryResolvedItem> changed{
      items[0],
      {{HalTelemetryItemKind::Param, "test.s32"}, HalTelemetryType::S32}};
  const auto updated = telemetry.update(created->subscription_id, 1, changed,
                                        std::chrono::milliseconds(100));
  assert(updated && updated->revision == 2 && updated->bindings.size() == 2);
  assert(updated->bindings[0].slot == created->bindings[0].slot);
  assert(updated->bindings[1].slot > created->bindings[1].slot);
  assert(telemetry.erase(created->subscription_id));
  assert(!telemetry.snapshot(created->subscription_id));
}

std::vector<std::uint8_t> bytes(std::string value) {
  return {value.begin(), value.end()};
}

std::string read_file(const fs::path& path) {
  std::ifstream input(path, std::ios::binary);
  return {std::istreambuf_iterator<char>(input),
          std::istreambuf_iterator<char>()};
}

void workspace_restart_cleanup_test() {
  const auto base =
      fs::temp_directory_path() /
      ("linuxcnc-grpc-workspace-restart-tests-" + std::to_string(::getpid()));
  const auto root = base / "workspaces";
  const auto active = base / "active-program";
  std::error_code error;
  fs::remove_all(base, error);

  fs::create_directories(active, error);
  assert(!error);
  {
    std::ofstream output(active / "current.ngc");
    output << "current";
  }
  fs::create_directories(base / ".active-program.staging-7", error);
  fs::create_directories(base / ".active-program.previous-7", error);
  fs::create_directories(base / ".other.staging-7", error);
  fs::create_directories(base / ".active-program.staging-not-ours", error);
  {
    std::ofstream output(base / ".active-program.staging-not-a-directory");
    output << "unrelated";
  }
  {
    ProgramWorkspaceStore restarted(root, active);
    assert(read_file(restarted.active_directory() / "current.ngc") ==
           "current");
  }
  assert(!fs::exists(base / ".active-program.staging-7"));
  assert(!fs::exists(base / ".active-program.previous-7"));
  assert(fs::is_directory(base / ".other.staging-7"));
  assert(fs::is_directory(base / ".active-program.staging-not-ours"));
  assert(read_file(base / ".active-program.staging-not-a-directory") ==
         "unrelated");

  fs::remove_all(active, error);
  fs::create_directories(base / ".active-program.previous-8", error);
  assert(!error);
  {
    std::ofstream output(base / ".active-program.previous-8" / "old.ngc");
    output << "last known good";
  }
  fs::create_directories(base / ".active-program.staging-8", error);
  assert(!error);
  {
    std::ofstream output(base / ".active-program.staging-8" / "new.ngc");
    output << "incomplete";
  }
  {
    ProgramWorkspaceStore restarted(root, active);
    assert(read_file(restarted.active_directory() / "old.ngc") ==
           "last known good");
  }
  assert(!fs::exists(base / ".active-program.previous-8"));
  assert(!fs::exists(base / ".active-program.staging-8"));

  fs::remove_all(base, error);
  assert(!error);
}

void workspace_traversal_quota_ttl_and_materialization_test() {
  const auto base =
      fs::temp_directory_path() /
      ("linuxcnc-grpc-native-edge-tests-" + std::to_string(::getpid()));
  std::error_code error;
  fs::remove_all(base, error);

  {
    ProgramWorkspaceStore store(base / "quota-workspaces",
                                base / "quota-active",
                                WorkspaceLimits{8, 10, std::chrono::hours(24)});
    const auto first = store.create();
    assert(store.write_file(first, "one.ngc", bytes("1234")));
    assert(store.write_file(first, "one.ngc", bytes("5678")));
    assert(store.write_file(first, "one.ngc", bytes("1234567")));
    assert(!store.write_file(first, "two.ngc", bytes("12345")));
    const auto second = store.create();
    assert(store.write_file(second, "two.ngc", bytes("xy")));
    assert(!store.write_file(second, "three.ngc", bytes("12345")));
    assert(store.remove_file(first, "one.ngc"));
    assert(store.write_file(second, "three.ngc", bytes("12345")));
    assert(!store.remove_file(second, "missing.ngc"));
    assert(!store.write_file(first, "../escape.ngc", bytes("x")));
    assert(!store.write_file(first, "/absolute.ngc", bytes("x")));
    fs::path rejected;
    assert(!store.resolve_entry(first, "../escape.ngc", &rejected));
    assert(!store.resolve_entry(first, "/absolute.ngc", &rejected));
    assert(!store.resolve_entry(first, "./one.ngc", &rejected));
    assert(store.erase(first));
    assert(store.erase(second));
  }

  {
    ProgramWorkspaceStore store(
        base / "workspace", base / "active",
        WorkspaceLimits{1024, 2048, std::chrono::hours(24)});
    const auto id = store.create();
    assert(store.write_file(id, ".upload-2", bytes("user data")));
    assert(store.write_file(id, "program/main.ngc", bytes("G0 X1\n")));
    assert(read_file(store.root() / id / ".upload-2") == "user data");
    assert(store.write_file(id, "program/main.tbl", bytes("tool companion\n")));
    assert(store.write_file(id, "subdir/notes.txt", bytes("notes")));
    fs::create_directories(store.active_directory() / "stale", error);
    {
      std::ofstream stale(store.active_directory() / "stale" / "old.ngc");
      stale << "stale";
    }
    fs::path resolved;
    assert(store.resolve_entry(id, "program/main.ngc", &resolved));
    assert(resolved == store.root() / id / "program/main.ngc");
    assert(read_file(resolved) == "G0 X1\n");
    fs::path materialized;
    assert(store.materialize(id, "program/main.ngc", &materialized));
    assert(materialized == store.active_directory() / "program/main.ngc");
    assert(read_file(materialized) == "G0 X1\n");
    assert(read_file(store.active_directory() / "program/main.tbl") ==
           "tool companion\n");
    assert(read_file(store.active_directory() / "subdir/notes.txt") == "notes");
    assert(!fs::exists(store.active_directory() / "stale"));

    const auto outside = base / "outside.txt";
    const auto outside_directory = base / "outside-directory";
    {
      std::ofstream output(outside);
      output << "outside";
    }
    fs::create_directories(outside_directory, error);
    fs::create_symlink(outside, store.root() / id / "linked.txt", error);
    assert(!error);
    fs::create_symlink(outside_directory, store.root() / id / "linked", error);
    assert(!error);
    assert(!store.resolve_entry(id, "linked.txt", &resolved));
    assert(!store.write_file(id, "linked/evil.ngc", bytes("evil")));
    assert(!store.materialize(id, "linked.txt"));
    assert(read_file(store.active_directory() / "program/main.ngc") ==
           "G0 X1\n");
    assert(store.write_file(id, "unsafe.sh", bytes("#!/bin/sh\n")));
    fs::permissions(store.root() / id / "unsafe.sh", fs::perms::owner_exec,
                    fs::perm_options::add, error);
    assert(!error);
    assert(!store.materialize(id, "program/main.ngc"));
    assert(read_file(store.active_directory() / "program/main.ngc") ==
           "G0 X1\n");
    assert(store.erase(id));
  }

  {
    ProgramWorkspaceStore store(
        base / "ttl-workspaces", base / "ttl-active",
        WorkspaceLimits{1024, 2048, std::chrono::hours(24)});
    const auto expired = store.create(std::chrono::seconds(-1));
    assert(store.prune_expired() == 1);
    assert(!store.erase(expired));
    const auto pinned = store.create(std::chrono::seconds(-1));
    assert(store.pin(pinned));
    assert(store.prune_expired() == 0);
    assert(store.unpin(pinned));
    assert(store.prune_expired() == 1);
  }

  fs::remove_all(base, error);
  assert(!error);
}

void scope_coalescing_and_conflict_accounting_test() {
  ScopeManager manager;
  assert(!manager.acquire(""));
  assert(manager.acquire("controller-a"));
  assert(manager.acquire("controller-a"));
  assert(!manager.acquire("controller-b"));

  const auto first = manager.publish({1, 2});
  assert(first && first->generation == 1);
  assert(first->payload == std::vector<std::uint8_t>({1, 2}));
  assert(!manager.publish({3}));
  assert(!manager.publish({4}));
  assert(manager.skipped_frames() == 0);
  assert(!manager.acknowledge("controller-b", first->generation));
  assert(!manager.acknowledge("controller-a", first->generation + 1));

  const auto second = manager.acknowledge("controller-a", first->generation);
  assert(second && second->generation == 3);
  assert(second->payload == std::vector<std::uint8_t>({4}));
  assert(second->skipped_frames == 1);
  assert(manager.skipped_frames() == 1);
  assert(!manager.acknowledge("controller-a", first->generation));
  assert(!manager.acknowledge("controller-a", second->generation));
  assert(manager.skipped_frames() == 1);

  const auto third = manager.publish({5});
  assert(third && third->generation == 4);
  manager.release("controller-b");
  assert(manager.acquired());
  manager.release("controller-a");
  assert(!manager.acquired());
  assert(manager.skipped_frames() == 0);
  assert(!manager.acknowledge("controller-a", third->generation));
  assert(!manager.publish({6}));
  assert(manager.acquire("controller-b"));
  const auto after_reacquire = manager.publish({7});
  assert(after_reacquire && after_reacquire->generation == 5);
  manager.release("controller-b");
}

}  // namespace

int main() {
  command_queue_bounds_and_wait_test();
  command_cancellation_and_acceptance_test();
  command_cancellation_before_worker_start_test();
  command_failure_wait_test();
  status_replay_rollover_test();
  position_cursor_generation_and_replacement_test();
  position_collinear_compaction_test();
  hal_value_telemetry_test();
  workspace_restart_cleanup_test();
  workspace_traversal_quota_ttl_and_materialization_test();
  scope_coalescing_and_conflict_accounting_test();
  return 0;
}
