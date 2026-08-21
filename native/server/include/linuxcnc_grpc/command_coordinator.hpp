#pragma once

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace linuxcnc::server {

enum class CommandWaitPolicy {
  Accepted,
  Completed,
};

enum class CommandState {
  Queued,
  Accepted,
  Completed,
  Failed,
};

struct CommandResult {
  std::uint64_t sequence = 0;
  CommandState state = CommandState::Queued;
  std::string error;
};

struct CommandContext {
  // NML adapters call this only after the command has been accepted by the
  // command channel. An RPC cancellation never invokes it or removes work.
  std::function<void()> mark_accepted;
  std::function<bool()> cancelled;
};

// A command is deliberately a native callable.  The gRPC layer translates a
// protobuf oneof into this object, while this coordinator remains unaware of
// protobuf and can be exercised without LinuxCNC or a network connection.
using CommandAction = std::function<void()>;
using ContextCommandAction = std::function<void(CommandContext&)>;

class CommandTicket {
 public:
  using Observer = std::function<void(const CommandResult&)>;

  CommandTicket() = default;

  std::uint64_t sequence() const noexcept;
  bool wait_for(CommandWaitPolicy policy, std::chrono::milliseconds timeout,
                CommandResult* result) const;
  bool wait_for(std::chrono::milliseconds timeout, CommandResult* result) const;
  CommandResult wait() const;
  // Registers a one-shot notification without occupying a worker. The
  // observer is invoked immediately when the requested state is already
  // available, otherwise by the command worker after releasing state locks.
  bool observe(CommandWaitPolicy policy, Observer observer) const;

 private:
  struct State {
    struct PendingObserver {
      CommandWaitPolicy policy;
      Observer callback;
    };
    mutable std::mutex mutex;
    std::condition_variable condition;
    CommandResult result;
    std::vector<PendingObserver> observers;
  };

  explicit CommandTicket(std::shared_ptr<State> state) : state_(std::move(state)) {}
  friend class CommandCoordinator;
  std::shared_ptr<State> state_;
};

class CommandCoordinator {
 public:
  explicit CommandCoordinator(std::size_t capacity = 128);
  ~CommandCoordinator();

  CommandCoordinator(const CommandCoordinator&) = delete;
  CommandCoordinator& operator=(const CommandCoordinator&) = delete;

  // submit() only queues the action.  The action is executed serially by the
  // coordinator worker, and cancellation of an RPC wait never removes an
  // already accepted action from this queue.
  CommandTicket submit(CommandAction action);
  CommandTicket submit_with_context(ContextCommandAction action);
  CommandTicket submit_with_context(ContextCommandAction action,
                                    std::function<bool()> cancelled);
  void shutdown();
  std::size_t queued() const;

 private:
  struct Item {
    std::uint64_t sequence = 0;
    CommandAction action;
    ContextCommandAction context_action;
    std::shared_ptr<CommandTicket::State> state;
  };

  void run();
  static void transition(const std::shared_ptr<CommandTicket::State>& state,
                         CommandState result, std::string error = {});

  const std::size_t capacity_;
  mutable std::mutex mutex_;
  std::condition_variable condition_;
  std::deque<Item> queue_;
  std::uint64_t next_sequence_ = 1;
  bool stopping_ = false;
  std::thread worker_;
};

}  // namespace linuxcnc::server
