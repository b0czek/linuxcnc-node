#pragma once

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <stop_token>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

namespace linuxcnc::server {

// Fixed-size executor with strict admission. Reserved submissions are used only
// for native cleanup and cannot be starved by ordinary RPC work.
class BoundedExecutor {
 public:
  using Task = std::function<void()>;

  BoundedExecutor(std::size_t threads, std::size_t capacity,
                  std::size_t cleanup_reserve = 0);
  ~BoundedExecutor();

  BoundedExecutor(const BoundedExecutor&) = delete;
  BoundedExecutor& operator=(const BoundedExecutor&) = delete;

  bool submit(Task task);
  bool submit_cleanup(Task task);
  void stop_admission();
  void drain();
  void shutdown(bool drain = true);
  std::size_t queued() const;
  bool accepting() const;
  std::size_t thread_count() const noexcept { return thread_count_; }

 private:
  struct Item {
    Task task;
    bool cleanup = false;
  };

  bool submit_impl(Task task, bool cleanup);
  void run();

  const std::size_t thread_count_;
  const std::size_t capacity_;
  const std::size_t cleanup_reserve_;
  mutable std::mutex mutex_;
  std::condition_variable condition_;
  std::deque<Item> queue_;
  std::vector<std::thread> workers_;
  std::size_t ordinary_queued_ = 0;
  std::size_t active_ = 0;
  bool accepting_ = true;
  bool stopping_ = false;
  bool drain_ = true;
};

class AdmissionCounter {
 public:
  explicit AdmissionCounter(std::size_t capacity) : capacity_(capacity) {}

  bool acquire() noexcept;
  void release() noexcept;
  void stop() noexcept;
  std::size_t active() const noexcept { return active_.load(); }

 private:
  const std::size_t capacity_;
  std::atomic<std::size_t> active_{0};
  std::atomic<bool> accepting_{true};
};

// Owns the shutdown edge for in-flight transport callbacks without depending
// on gRPC types. Registrations are removed by their move-only token. Shutdown
// takes a snapshot so callback code never runs while the registry is locked.
class ActiveCallbackRegistry {
 private:
  struct State {
    std::mutex mutex;
    std::unordered_map<std::uint64_t, std::function<void()>> callbacks;
    std::uint64_t next_id = 1;
    bool shutting_down = false;
  };

 public:
  class Registration {
   public:
    Registration() = default;
    Registration(const Registration&) = delete;
    Registration& operator=(const Registration&) = delete;
    Registration(Registration&& other) noexcept { *this = std::move(other); }
    Registration& operator=(Registration&& other) noexcept {
      if (this == &other) return *this;
      reset();
      state_ = std::move(other.state_);
      id_ = std::exchange(other.id_, 0);
      return *this;
    }
    ~Registration() { reset(); }

    explicit operator bool() const noexcept { return id_ != 0; }

    void reset() noexcept {
      auto state = state_.lock();
      if (state && id_ != 0) {
        std::lock_guard lock(state->mutex);
        state->callbacks.erase(id_);
      }
      state_.reset();
      id_ = 0;
    }

   private:
    Registration(std::weak_ptr<State> state, std::uint64_t id)
        : state_(std::move(state)), id_(id) {}
    std::weak_ptr<State> state_;
    std::uint64_t id_ = 0;
    friend class ActiveCallbackRegistry;
  };

  ActiveCallbackRegistry() : state_(std::make_shared<State>()) {}

  Registration register_callback(std::function<void()> callback) {
    if (!callback) return {};
    std::lock_guard lock(state_->mutex);
    if (state_->shutting_down) return {};
    const auto id = state_->next_id++;
    state_->callbacks.emplace(id, std::move(callback));
    return Registration(state_, id);
  }

  void shutdown() {
    std::vector<std::function<void()>> callbacks;
    {
      std::lock_guard lock(state_->mutex);
      if (state_->shutting_down) return;
      state_->shutting_down = true;
      callbacks.reserve(state_->callbacks.size());
      for (const auto& entry : state_->callbacks)
        callbacks.push_back(entry.second);
    }
    for (const auto& callback : callbacks) callback();
  }

  std::size_t active_count() const {
    std::lock_guard lock(state_->mutex);
    return state_->callbacks.size();
  }

 private:
  std::shared_ptr<State> state_;
};

template <typename Event>
class SequencedRing {
 public:
  struct Entry {
    std::uint64_t sequence;
    Event event;
  };
  struct ReadResult {
    bool behind = false;
    std::vector<Entry> entries;
  };

  explicit SequencedRing(std::size_t capacity) : capacity_(capacity) {
    if (capacity == 0)
      throw std::invalid_argument("ring capacity must be positive");
  }

  std::uint64_t publish(Event event) {
    std::lock_guard lock(mutex_);
    const auto sequence = next_sequence_++;
    entries_.push_back({sequence, std::move(event)});
    if (entries_.size() > capacity_) entries_.pop_front();
    return sequence;
  }

  ReadResult after(std::uint64_t sequence) const {
    std::lock_guard lock(mutex_);
    ReadResult result;
    if (!entries_.empty() && sequence != 0 &&
        sequence + 1 < entries_.front().sequence) {
      result.behind = true;
      return result;
    }
    for (const auto& entry : entries_) {
      if (entry.sequence > sequence) result.entries.push_back(entry);
    }
    return result;
  }

  std::uint64_t next_sequence() const {
    std::lock_guard lock(mutex_);
    return next_sequence_;
  }

 private:
  const std::size_t capacity_;
  mutable std::mutex mutex_;
  std::deque<Entry> entries_;
  std::uint64_t next_sequence_ = 1;
};

// Transport-neutral one-write pump. Producers coalesce to the newest value
// while a write is active; the next write starts only after completion.
template <typename Message>
class OutboundPump {
 public:
  struct Output {
    Message message;
    std::uint64_t skipped = 0;
  };

  bool offer(Message message) {
    std::lock_guard lock(mutex_);
    if (closed_) return false;
    if (writing_) {
      if (pending_) ++skipped_;
      pending_ = std::move(message);
      return false;
    }
    current_ = std::move(message);
    writing_ = true;
    return true;
  }

  Output current() const {
    std::lock_guard lock(mutex_);
    if (!current_) throw std::logic_error("outbound pump has no current value");
    return Output{current_.value(), 0};
  }

  // Returns the next coalesced output when another write should start.
  std::optional<Output> write_complete(bool ok) {
    std::lock_guard lock(mutex_);
    current_.reset();
    if (!ok || closed_) {
      writing_ = false;
      pending_.reset();
      return std::nullopt;
    }
    if (!pending_) {
      writing_ = false;
      return std::nullopt;
    }
    current_ = std::move(pending_);
    pending_.reset();
    Output output{*current_, skipped_};
    skipped_ = 0;
    return output;
  }

  void close() {
    std::lock_guard lock(mutex_);
    closed_ = true;
    pending_.reset();
  }

 private:
  mutable std::mutex mutex_;
  std::optional<Message> current_;
  std::optional<Message> pending_;
  std::uint64_t skipped_ = 0;
  bool writing_ = false;
  bool closed_ = false;
};

// Subscription callbacks are invoked outside the hub mutex. A copied callback
// may run once after unsubscribe, so callers must capture only weak lifetime
// state.
template <typename Event>
class SubscriptionHub {
 public:
  using Callback = std::function<void(const Event&)>;

 private:
  struct State {
    std::mutex mutex;
    std::unordered_map<std::uint64_t, Callback> callbacks;
    std::uint64_t next_id = 1;
    bool closed = false;
  };

 public:
  class Subscription {
   public:
    Subscription() = default;
    Subscription(const Subscription&) = delete;
    Subscription& operator=(const Subscription&) = delete;
    Subscription(Subscription&& other) noexcept { *this = std::move(other); }
    Subscription& operator=(Subscription&& other) noexcept {
      if (this == &other) return *this;
      reset();
      state_ = std::move(other.state_);
      id_ = std::exchange(other.id_, 0);
      return *this;
    }
    ~Subscription() { reset(); }

    void reset() noexcept {
      auto state = state_.lock();
      if (state && id_ != 0) {
        std::lock_guard lock(state->mutex);
        state->callbacks.erase(id_);
      }
      state_.reset();
      id_ = 0;
    }

   private:
    Subscription(std::weak_ptr<State> state, std::uint64_t id)
        : state_(std::move(state)), id_(id) {}
    std::weak_ptr<State> state_;
    std::uint64_t id_ = 0;
    friend class SubscriptionHub<Event>;
  };

  SubscriptionHub() : state_(std::make_shared<State>()) {}

  Subscription subscribe(Callback callback) {
    if (!callback) return {};
    std::lock_guard lock(state_->mutex);
    if (state_->closed) return {};
    const auto id = state_->next_id++;
    state_->callbacks.emplace(id, std::move(callback));
    return Subscription(state_, id);
  }

  void publish(const Event& event) const {
    std::vector<Callback> callbacks;
    {
      std::lock_guard lock(state_->mutex);
      if (state_->closed) return;
      callbacks.reserve(state_->callbacks.size());
      for (const auto& entry : state_->callbacks)
        callbacks.push_back(entry.second);
    }
    for (const auto& callback : callbacks) callback(event);
  }

  void close() {
    std::lock_guard lock(state_->mutex);
    state_->closed = true;
    state_->callbacks.clear();
  }

  std::size_t subscriber_count() const {
    std::lock_guard lock(state_->mutex);
    return state_->callbacks.size();
  }

 private:
  std::shared_ptr<State> state_;
};

// Serializes access from worker/hub callbacks to a heap reactor. Invocation
// holds the gate mutex while making the deliberately bounded reactor call, so
// detach() establishes that no raw pointer invocation can still be in flight.
template <typename Reactor>
class LifetimeGate {
 public:
  enum class State { Open, Finishing, Done };

  explicit LifetimeGate(Reactor* reactor) : reactor_(reactor) {}

  template <typename Function>
  bool invoke(Function&& function) {
    std::lock_guard lock(mutex_);
    if (state_ != State::Open || reactor_ == nullptr) return false;
    function(*reactor_);
    return true;
  }

  template <typename Function>
  bool finish(Function&& function) {
    std::lock_guard lock(mutex_);
    if (state_ != State::Open) return false;
    state_ = State::Finishing;
    if (reactor_ != nullptr) function(*reactor_);
    return true;
  }

  bool begin_finish() {
    return finish([](Reactor&) {});
  }

  void detach() {
    std::lock_guard lock(mutex_);
    state_ = State::Done;
    reactor_ = nullptr;
  }

  State state() const {
    std::lock_guard lock(mutex_);
    return state_;
  }

 private:
  // A bounded invocation may decide to finish. Keeping the lifetime guard
  // recursively in that transition prevents detach/delete from racing it.
  mutable std::recursive_mutex mutex_;
  Reactor* reactor_;
  State state_ = State::Open;
};

}  // namespace linuxcnc::server
