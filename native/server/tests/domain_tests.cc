#include <atomic>
#include <cassert>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <thread>
#include <vector>

#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/command_coordinator.hpp"
#include "linuxcnc_grpc/daemon_config.hpp"
#include "linuxcnc_grpc/hal_repository.hpp"
#include "linuxcnc_grpc/nml_adapter.hpp"
#include "linuxcnc_grpc/position_history.hpp"
#include "linuxcnc_grpc/program_workspace.hpp"
#include "linuxcnc_grpc/scope_manager.hpp"
#include "linuxcnc_grpc/status_hub.hpp"

namespace fs = std::filesystem;
using namespace linuxcnc::server;

void expect(bool condition) {
  assert(condition);
  (void)condition;
}

void callback_runtime_test() {
  ActiveCallbackRegistry registry;
  std::atomic<int> shutdown_calls{0};
  auto first_registration =
      registry.register_callback([&] { ++shutdown_calls; });
  auto second_registration =
      registry.register_callback([&] { ++shutdown_calls; });
  assert(first_registration && second_registration);
  assert(registry.active_count() == 2);
  first_registration.reset();
  assert(registry.active_count() == 1);
  registry.shutdown();
  registry.shutdown();
  assert(shutdown_calls == 1);
  assert(!registry.register_callback([] {}));
  second_registration.reset();
  assert(registry.active_count() == 0);

  struct RegistryTarget {
    std::atomic<int> finishes{0};
  } registry_target;
  auto registry_gate =
      std::make_shared<LifetimeGate<RegistryTarget>>(&registry_target);
  ActiveCallbackRegistry racing_registry;
  std::atomic<int> callback_calls{0};
  std::atomic<int> cleanup_calls{0};
  std::vector<ActiveCallbackRegistry::Registration> registrations;
  for (int index = 0; index < 64; ++index) {
    const std::weak_ptr<LifetimeGate<RegistryTarget>> weak = registry_gate;
    registrations.push_back(racing_registry.register_callback([&, weak] {
      ++callback_calls;
      if (auto gate = weak.lock())
        gate->finish([](RegistryTarget& target) { ++target.finishes; });
    }));
  }
  assert(racing_registry.active_count() == registrations.size());
  std::atomic<bool> race_started{false};
  std::thread shutdown_thread([&] {
    while (!race_started.load()) std::this_thread::yield();
    racing_registry.shutdown();
  });
  std::thread done_thread([&] {
    while (!race_started.load()) std::this_thread::yield();
    for (auto& registration : registrations) {
      registration.reset();
      ++cleanup_calls;
    }
    registry_gate->detach();
  });
  race_started = true;
  shutdown_thread.join();
  done_thread.join();
  const auto calls_after_shutdown = callback_calls.load();
  racing_registry.shutdown();
  assert(callback_calls == calls_after_shutdown);
  assert(callback_calls <= 64);
  assert(registry_target.finishes <= 1);
  assert(cleanup_calls == 64);
  assert(racing_registry.active_count() == 0);

  BoundedExecutor executor(1, 3, 1);
  std::atomic<bool> hold{true};
  std::atomic<int> completed{0};
  expect(executor.submit([&] {
    while (hold.load()) std::this_thread::yield();
    ++completed;
  }));
  while (executor.queued() != 0) std::this_thread::yield();
  expect(executor.submit([&] { ++completed; }));
  expect(executor.submit([&] { ++completed; }));
  expect(!executor.submit([&] { ++completed; }));
  expect(executor.submit_cleanup([&] { ++completed; }));
  expect(!executor.submit_cleanup([&] { ++completed; }));
  hold = false;
  executor.shutdown();
  assert(completed == 4);

  AdmissionCounter admission(2);
  assert(admission.acquire());
  assert(admission.acquire());
  assert(!admission.acquire());
  admission.release();
  admission.stop();
  assert(!admission.acquire());

  SubscriptionHub<int> hub;
  std::vector<int> received;
  auto subscription =
      hub.subscribe([&](const int& event) { received.push_back(event); });
  hub.publish(7);
  subscription.reset();
  hub.publish(8);
  assert((received == std::vector<int>{7}));

  SequencedRing<int> ring(2);
  ring.publish(1);
  const auto first_sequence = ring.publish(2);
  ring.publish(3);
  assert(ring.after(0).entries.size() == 2);
  assert(ring.after(first_sequence).entries.size() == 1);
  ring.publish(4);
  assert(ring.after(1).behind);

  OutboundPump<int> pump;
  assert(pump.offer(1));
  assert(!pump.offer(2));
  assert(!pump.offer(3));
  assert(pump.current().message == 1);
  const auto coalesced = pump.write_complete(true);
  assert(coalesced && coalesced->message == 3 && coalesced->skipped == 1);
  assert(!pump.write_complete(true));

  struct Target {
    int calls = 0;
  } target;
  auto gate = std::make_shared<LifetimeGate<Target>>(&target);
  expect(gate->invoke([](Target& value) { ++value.calls; }));
  assert(gate->begin_finish());
  assert(!gate->begin_finish());
  expect(!gate->invoke([](Target& value) { ++value.calls; }));
  gate->detach();
  expect(!gate->invoke([](Target& value) { ++value.calls; }));
  assert(target.calls == 1);

  struct RacingTarget {
    std::atomic<int> finishes{0};
  } racing_target;
  auto racing_gate =
      std::make_shared<LifetimeGate<RacingTarget>>(&racing_target);
  std::atomic<bool> start_race{false};
  std::vector<std::thread> finishers;
  for (int index = 0; index < 16; ++index) {
    finishers.emplace_back([&, racing_gate] {
      while (!start_race.load()) std::this_thread::yield();
      racing_gate->finish([](RacingTarget& value) { ++value.finishes; });
    });
  }
  start_race = true;
  for (auto& finisher : finishers) finisher.join();
  assert(racing_target.finishes == 1);
  assert(!racing_gate->invoke([](RacingTarget&) { assert(false); }));
  racing_gate->detach();

  CancellationToken token;
  assert(!token.cancelled());
  assert(token.cancel());
  assert(!token.cancel());
  assert(token.cancelled());
}

void cleanup_reserve_saturation_test() {
  BoundedExecutor executor(1, 128, 16);
  std::atomic<bool> release_worker{false};
  std::atomic<int> cleaned{0};
  expect(executor.submit([&] {
    while (!release_worker.load()) std::this_thread::yield();
  }));
  while (executor.queued() != 0) std::this_thread::yield();
  for (int index = 0; index < 112; ++index) expect(executor.submit([] {}));
  assert(!executor.submit([] {}));
  for (int index = 0; index < 16; ++index)
    expect(executor.submit_cleanup([&] { ++cleaned; }));
  expect(!executor.submit_cleanup([&] { ++cleaned; }));
  release_worker = true;
  executor.drain();
  assert(cleaned == 16);
  executor.shutdown();
}

void nml_command_catalog_test() {
  static_assert(static_cast<std::size_t>(NmlCommandKind::SetRapidRate) == 50);
  // The enum is deliberately contiguous: the wire catalog has a matching
  // static assertion in grpc/machine_service.cc, so adding a command forces
  // both boundaries to be reviewed at compile time.
  for (std::size_t index = 0; index <= 50; ++index) {
    assert(static_cast<std::size_t>(static_cast<NmlCommandKind>(index)) ==
           index);
  }
}

void command_coordinator_test() {
  CommandCoordinator coordinator(2);
  std::atomic<bool> started{false};
  std::atomic<bool> allow_accept{false};
  auto ticket = coordinator.submit_with_context([&](CommandContext& context) {
    started = true;
    while (!allow_accept.load()) std::this_thread::yield();
    context.mark_accepted();
  });
  while (!started.load()) std::this_thread::yield();
  CommandResult result;
  assert(!ticket.wait_for(CommandWaitPolicy::Accepted,
                          std::chrono::milliseconds(1), &result));
  allow_accept = true;
  assert(ticket.wait_for(CommandWaitPolicy::Accepted, std::chrono::seconds(1),
                         &result));
  assert(result.state == CommandState::Accepted ||
         result.state == CommandState::Completed);
  assert(ticket.wait_for(std::chrono::seconds(1), &result));
  assert(result.state == CommandState::Completed);
  std::atomic<int> observed{0};
  expect(ticket.observe(CommandWaitPolicy::Completed,
                        [&](const CommandResult& value) {
                          assert(value.state == CommandState::Completed);
                          ++observed;
                        }));
  assert(observed == 1);
  coordinator.shutdown();
}

void daemon_config_test() {
  DaemonConfig config;
  char program[] = "linuxcnc-grpc-server";
  char period[] = "--status-period-ms=25";
  char quota[] = "--workspace-quota=64";
  char* arguments[] = {program, period, quota};
  std::string error;
  assert(parse_config(3, arguments, &config, nullptr, &error));
  assert(config.status_period == std::chrono::milliseconds(25));
  assert(config.workspace_quota_bytes == 64);
  char telemetry[] = "--telemetry-endpoint=127.0.0.1:51000";
  char* telemetry_arguments[] = {program, telemetry};
  assert(parse_config(2, telemetry_arguments, &config, nullptr, &error));
  assert(config.telemetry_endpoint == "127.0.0.1:51000");
  config.telemetry_endpoint = config.endpoint;
  assert(!validate_config(config, &error));
  config.telemetry_endpoint = "127.0.0.1:51000";
  char ttl[] = "--workspace-ttl-seconds=90";
  char* ttl_arguments[] = {program, ttl};
  assert(parse_config(2, ttl_arguments, &config, nullptr, &error));
  assert(config.workspace_ttl == std::chrono::seconds(90));
  char scope_samples[] = "--scope-samples=64000";
  char* scope_arguments[] = {program, scope_samples};
  assert(parse_config(2, scope_arguments, &config, nullptr, &error));
  assert(config.scope_samples == 64000);
  config.scope_samples = 999;
  assert(!validate_config(config, &error));
  config.scope_samples = 64000;
  config.endpoint = "0.0.0.0:50051";
  assert(!validate_config(config, &error));
  config.unsafe_non_loopback = true;
  assert(validate_config(config, &error));

  const auto base = fs::temp_directory_path() / "linuxcnc-grpc-config-test";
  std::error_code filesystem_error;
  fs::remove_all(base, filesystem_error);
  fs::create_directories(base / "active");
  {
    std::ofstream ini(base / "machine.ini");
    ini << "[DISPLAY]\nPROGRAM_PREFIX = active\n";
  }
  assert(
      validate_program_prefix(base / "machine.ini", base / "active", &error));
  {
    std::ofstream certificate(base / "server.crt");
    std::ofstream private_key(base / "server.key");
    certificate << "certificate";
    private_key << "private key";
    config.endpoint = "0.0.0.0:50051";
    config.unsafe_non_loopback = false;
    config.tls = true;
    config.tls_certificate = base / "server.crt";
    config.tls_private_key = base / "server.key";
    assert(validate_config(config, &error));
    config.telemetry_endpoint = "0.0.0.0:50052";
    assert(!validate_config(config, &error));
    config.unsafe_non_loopback = true;
    assert(validate_config(config, &error));
  }
  fs::remove_all(base, filesystem_error);
}

void status_hub_test() {
  StatusHub hub(2);
  hub.replace_snapshot({StatusField{1, std::int32_t{10}}});
  const auto first = hub.sequence();
  hub.publish({StatusField{1, std::int32_t{11}}});
  hub.publish({StatusField{1, std::int32_t{12}}});
  const auto replay = hub.replay_after(first);
  assert(!replay.snapshot_required);
  assert(replay.deltas.size() == 2);
  const auto stale = hub.replay_after(0);
  assert(stale.snapshot_required);
}

void position_history_test() {
  PositionHistory history(2);
  PositionSample first;
  assert(history.append(first));
  assert(!history.append(first));
  first.coordinates[0] = 1.0;
  assert(history.append(first));
  auto snapshot = history.snapshot();
  assert(snapshot.reset);
  assert(snapshot.packed.size() == 2 * kPositionStride);
  assert(!history.since(history.next_sequence()).reset);
  first.coordinates[0] = 2.0;
  assert(history.append(first));
  assert(history.append(PositionSample{}));
  assert(
      history.since(0).reset);  // cursor was rolled out of the bounded window
  const auto generation = history.snapshot().generation;
  history.clear();
  assert(history.since(history.next_sequence(), 0, generation).reset);
}

void hal_repository_test() {
  HalRepository repository;
  assert(repository.add_item(
      HalItem{"u64", HalScalarType::U64, true, true, std::uint64_t{0}}));
  const std::uint64_t value = 0xffffffffffffffffULL;
  assert(repository.write("u64", value));
  HalValue read;
  assert(repository.read("u64", &read));
  assert(std::get<std::uint64_t>(read) == value);
  assert(!repository.write("u64", std::uint32_t{1}));
}

void scope_manager_test() {
  ScopeManager manager;
  assert(manager.acquire("inspector"));
  assert(!manager.acquire("another"));
  auto first = manager.publish({1});
  assert(first && first->generation == 1);
  assert(!manager.publish({2}));
  assert(!manager.publish({3}));
  auto next = manager.acknowledge("inspector", first->generation);
  assert(next && next->skipped_frames == 1);
  assert(manager.skipped_frames() == 1);
  manager.release("inspector");
  assert(!manager.acquired());
  assert(manager.skipped_frames() == 0);
}

void workspace_test() {
  const auto base = fs::temp_directory_path() / "linuxcnc-grpc-domain-test";
  std::error_code error;
  fs::remove_all(base, error);
  ProgramWorkspaceStore store(
      base / "workspaces", base / "active",
      WorkspaceLimits{1024, 2048, std::chrono::hours(24)});
  const auto id = store.create();
  const std::vector<std::uint8_t> contents{'G', '0', ' ', 'X', '0', '\n'};
  assert(store.write_file(id, "program/main.ngc", contents));
  assert(!store.write_file(id, "/absolute.ngc", contents));
  assert(!store.write_file(id, "../escape.ngc", contents));
  fs::path resolved;
  assert(store.resolve_entry(id, "program/main.ngc", &resolved));
  assert(fs::is_regular_file(resolved));
  assert(!store.resolve_entry(id, "../escape.ngc", &resolved));
  fs::path entry;
  assert(store.materialize(id, "program/main.ngc", &entry));
  assert(fs::exists(entry));
  assert(store.pin(id));
  assert(store.pin(id));
  assert(!store.erase(id));
  assert(store.unpin(id));
  assert(!store.erase(id));
  assert(store.unpin(id));
  assert(!store.unpin(id));
  assert(store.erase(id));
  fs::remove_all(base, error);
}

int main() {
  callback_runtime_test();
  cleanup_reserve_saturation_test();
  nml_command_catalog_test();
  command_coordinator_test();
  daemon_config_test();
  status_hub_test();
  position_history_test();
  hal_repository_test();
  scope_manager_test();
  workspace_test();
  return 0;
}
