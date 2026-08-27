#include "linuxcnc_grpc/command_coordinator.hpp"

#include <stdexcept>

namespace linuxcnc::server {

std::uint64_t CommandTicket::sequence() const noexcept {
  if (!state_) return 0;
  std::lock_guard lock(state_->mutex);
  return state_->result.sequence;
}

bool CommandTicket::wait_for(std::chrono::milliseconds timeout,
                             CommandResult* result) const {
  return wait_for(CommandWaitPolicy::Completed, timeout, result);
}

bool CommandTicket::wait_for(CommandWaitPolicy policy,
                             std::chrono::milliseconds timeout,
                             CommandResult* result) const {
  if (!state_) return false;
  std::unique_lock lock(state_->mutex);
  const bool ready = state_->condition.wait_for(lock, timeout, [this, policy] {
    if (policy == CommandWaitPolicy::Accepted) {
      return state_->result.state == CommandState::Accepted ||
             state_->result.state == CommandState::Completed ||
             state_->result.state == CommandState::Failed;
    }
    return state_->result.state == CommandState::Completed ||
           state_->result.state == CommandState::Failed;
  });
  if (result) *result = state_->result;
  return ready;
}

CommandResult CommandTicket::wait() const {
  if (!state_) return {};
  std::unique_lock lock(state_->mutex);
  state_->condition.wait(lock, [this] {
    return state_->result.state == CommandState::Completed ||
           state_->result.state == CommandState::Failed;
  });
  return state_->result;
}

bool CommandTicket::observe(CommandWaitPolicy policy, Observer observer) const {
  if (!state_ || !observer) return false;
  CommandResult ready_result;
  bool ready = false;
  {
    std::lock_guard lock(state_->mutex);
    ready = state_->result.state == CommandState::Failed ||
            state_->result.state == CommandState::Completed ||
            (policy == CommandWaitPolicy::Accepted &&
             state_->result.state == CommandState::Accepted);
    if (!ready) {
      state_->observers.push_back({policy, std::move(observer)});
      return true;
    }
    ready_result = state_->result;
  }
  observer(ready_result);
  return true;
}

CommandCoordinator::CommandCoordinator(std::size_t capacity,
                                       std::size_t safety_capacity)
    : capacity_(capacity == 0 ? 1 : capacity),
      safety_capacity_(safety_capacity == 0 ? 1 : safety_capacity),
      worker_(&CommandCoordinator::run, this) {}

CommandCoordinator::~CommandCoordinator() { shutdown(); }

CommandTicket CommandCoordinator::submit(CommandAction action,
                                         CommandPriority priority) {
  if (!action) throw std::invalid_argument("command action must not be empty");

  auto state = std::make_shared<CommandTicket::State>();
  std::unique_lock lock(mutex_);
  if (stopping_) throw std::runtime_error("command coordinator is stopped");
  auto& queue = priority == CommandPriority::Safety ? safety_queue_ : queue_;
  const auto capacity = priority == CommandPriority::Safety ? safety_capacity_
                                                             : capacity_;
  if (queue.size() >= capacity)
    throw std::runtime_error("command queue is full");
  const auto sequence = next_sequence_++;
  state->result.sequence = sequence;
  queue.push_back(Item{sequence, std::move(action), {}, state});
  lock.unlock();
  condition_.notify_one();
  return CommandTicket(std::move(state));
}

CommandTicket CommandCoordinator::submit_with_context(
    ContextCommandAction action) {
  return submit_with_context(std::move(action), {}, CommandPriority::Normal);
}

CommandTicket CommandCoordinator::submit_with_context(
    ContextCommandAction action, std::stop_token stop_token,
    CommandPriority priority) {
  if (!action) throw std::invalid_argument("command action must not be empty");
  auto state = std::make_shared<CommandTicket::State>();
  std::unique_lock lock(mutex_);
  if (stopping_) throw std::runtime_error("command coordinator is stopped");
  auto& queue = priority == CommandPriority::Safety ? safety_queue_ : queue_;
  const auto capacity = priority == CommandPriority::Safety ? safety_capacity_
                                                             : capacity_;
  if (queue.size() >= capacity)
    throw std::runtime_error("command queue is full");
  const auto sequence = next_sequence_++;
  state->result.sequence = sequence;
  queue.push_back(
      Item{sequence,
           {},
           [action = std::move(action), stop_token](CommandContext& context) {
             context.stop_token = stop_token;
             action(context);
           },
           state});
  lock.unlock();
  condition_.notify_one();
  return CommandTicket(std::move(state));
}

void CommandCoordinator::shutdown() {
  {
    std::lock_guard lock(mutex_);
    if (stopping_) return;
    stopping_ = true;
  }
  condition_.notify_all();
  if (worker_.joinable()) worker_.join();
}

std::size_t CommandCoordinator::queued() const {
  std::lock_guard lock(mutex_);
  return queue_.size() + safety_queue_.size();
}

void CommandCoordinator::run() {
  while (true) {
    Item item;
    {
      std::unique_lock lock(mutex_);
      condition_.wait(lock, [this] {
        return stopping_ || !safety_queue_.empty() || !queue_.empty();
      });
      if (queue_.empty() && safety_queue_.empty() && stopping_) return;
      auto& next = safety_queue_.empty() ? queue_ : safety_queue_;
      item = std::move(next.front());
      next.pop_front();
    }

    const auto mark_accepted =
        [state = item.state](std::uint64_t accepted_sequence) {
          transition(state, CommandState::Accepted, {}, accepted_sequence);
        };

    try {
      if (item.context_action) {
        bool deferred = false;
        CommandContext context{
            mark_accepted,
            {},
            [&deferred] { deferred = true; },
            [state = item.state] {
              transition(state, CommandState::Completed);
            },
            [state = item.state](std::string error) {
              transition(state, CommandState::Failed, std::move(error));
            }};
        item.context_action(context);
        if (!deferred) transition(item.state, CommandState::Completed);
      } else {
        item.action();
        mark_accepted(0);
        transition(item.state, CommandState::Completed);
      }
    } catch (const std::exception& error) {
      transition(item.state, CommandState::Failed, error.what());
    } catch (...) {
      transition(item.state, CommandState::Failed,
                 "command failed with an unknown exception");
    }
  }
}

void CommandCoordinator::transition(
    const std::shared_ptr<CommandTicket::State>& state, CommandState result,
    std::string error, std::uint64_t accepted_sequence) {
  std::vector<CommandTicket::Observer> ready;
  CommandResult snapshot;
  {
    std::lock_guard lock(state->mutex);
    if (state->result.state == CommandState::Completed ||
        state->result.state == CommandState::Failed)
      return;
    if (result == CommandState::Accepted &&
        state->result.state != CommandState::Queued) {
      return;
    }
    if (result == CommandState::Accepted)
      state->result.accepted_sequence = accepted_sequence;
    state->result.state = result;
    state->result.error = std::move(error);
    snapshot = state->result;
    auto observer = state->observers.begin();
    while (observer != state->observers.end()) {
      const bool terminal =
          result == CommandState::Completed || result == CommandState::Failed;
      if (terminal || (observer->policy == CommandWaitPolicy::Accepted &&
                       result == CommandState::Accepted)) {
        ready.push_back(std::move(observer->callback));
        observer = state->observers.erase(observer);
      } else {
        ++observer;
      }
    }
    state->condition.notify_all();
  }
  for (const auto& callback : ready) callback(snapshot);
}

}  // namespace linuxcnc::server
