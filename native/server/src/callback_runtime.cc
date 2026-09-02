#include "linuxcnc_grpc/callback_runtime.hpp"

#include <stdexcept>

namespace linuxcnc::server {

BoundedExecutor::BoundedExecutor(std::size_t threads, std::size_t capacity,
                                 std::size_t cleanup_reserve)
    : thread_count_(threads),
      capacity_(capacity),
      cleanup_reserve_(cleanup_reserve) {
  if (threads == 0 || capacity == 0 || cleanup_reserve > capacity) {
    throw std::invalid_argument("invalid bounded executor limits");
  }
  workers_.reserve(threads);
  for (std::size_t index = 0; index < threads; ++index) {
    workers_.emplace_back(&BoundedExecutor::run, this);
  }
}

BoundedExecutor::~BoundedExecutor() { shutdown(); }

bool BoundedExecutor::submit(Task task) {
  return submit_impl(std::move(task), false);
}

bool BoundedExecutor::submit_cleanup(Task task) {
  return submit_impl(std::move(task), true);
}

bool BoundedExecutor::submit_impl(Task task, bool cleanup) {
  if (!task) return false;
  {
    std::lock_guard lock(mutex_);
    if (stopping_ || (!cleanup && !accepting_)) return false;
    if (queue_.size() >= capacity_) return false;
    if (!cleanup && ordinary_queued_ >= capacity_ - cleanup_reserve_)
      return false;
    queue_.push_back(Item{std::move(task), cleanup});
    if (!cleanup) ++ordinary_queued_;
  }
  condition_.notify_one();
  return true;
}

void BoundedExecutor::stop_admission() {
  std::lock_guard lock(mutex_);
  accepting_ = false;
}

void BoundedExecutor::drain() {
  std::unique_lock lock(mutex_);
  condition_.wait(lock, [this] { return queue_.empty() && active_ == 0; });
}

void BoundedExecutor::shutdown(bool drain) {
  {
    std::lock_guard lock(mutex_);
    if (stopping_) return;
    accepting_ = false;
    stopping_ = true;
    drain_ = drain;
    if (!drain_) {
      queue_.clear();
      ordinary_queued_ = 0;
    }
  }
  condition_.notify_all();
  for (auto& worker : workers_) {
    if (worker.joinable()) worker.join();
  }
}

std::size_t BoundedExecutor::queued() const {
  std::lock_guard lock(mutex_);
  return queue_.size();
}

bool BoundedExecutor::accepting() const {
  std::lock_guard lock(mutex_);
  return accepting_ && !stopping_;
}

void BoundedExecutor::run() {
  while (true) {
    Item item;
    {
      std::unique_lock lock(mutex_);
      condition_.wait(lock, [this] { return stopping_ || !queue_.empty(); });
      if (queue_.empty()) {
        if (stopping_) return;
        continue;
      }
      item = std::move(queue_.front());
      queue_.pop_front();
      if (!item.cleanup) --ordinary_queued_;
      ++active_;
    }
    try {
      item.task();
    } catch (...) {
      // Tasks communicate failure through their result state. An exception is
      // contained so one malformed request cannot kill a daemon worker.
      item.task = {};
    }
    {
      std::lock_guard lock(mutex_);
      --active_;
      if (queue_.empty() && active_ == 0) condition_.notify_all();
      if (stopping_ && (!drain_ || queue_.empty())) condition_.notify_all();
    }
  }
}

bool AdmissionCounter::acquire() noexcept {
  if (!accepting_.load()) return false;
  auto current = active_.load();
  while (current < capacity_) {
    if (active_.compare_exchange_weak(current, current + 1)) {
      if (accepting_.load()) return true;
      release();
      return false;
    }
  }
  return false;
}

void AdmissionCounter::release() noexcept {
  const auto previous = active_.fetch_sub(1);
  if (previous == 0) active_.store(0);
}

void AdmissionCounter::stop() noexcept { accepting_.store(false); }

}  // namespace linuxcnc::server
