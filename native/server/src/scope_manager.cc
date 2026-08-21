#include "linuxcnc_grpc/scope_manager.hpp"

namespace linuxcnc::server {

bool ScopeManager::acquire(const std::string& controller_id) {
  if (controller_id.empty()) return false;
  std::lock_guard lock(mutex_);
  if (!controller_id_.empty() && controller_id_ != controller_id) return false;
  controller_id_ = controller_id;
  return true;
}

void ScopeManager::release(const std::string& controller_id) {
  std::lock_guard lock(mutex_);
  if (controller_id_ != controller_id) return;
  controller_id_.clear();
  in_flight_.reset();
  pending_.reset();
  pending_skipped_frames_ = 0;
  skipped_frames_ = 0;
}

bool ScopeManager::acquired() const {
  std::lock_guard lock(mutex_);
  return !controller_id_.empty();
}

std::optional<ScopeFrame> ScopeManager::publish(std::vector<std::uint8_t> payload) {
  std::lock_guard lock(mutex_);
  if (controller_id_.empty()) return std::nullopt;
  ScopeFrame frame{next_generation_++, std::move(payload), 0};
  if (in_flight_) {
    if (pending_) ++pending_skipped_frames_;
    pending_ = std::move(frame);
    return std::nullopt;
  }
  in_flight_ = frame;
  return frame;
}

std::optional<ScopeFrame> ScopeManager::acknowledge(const std::string& controller_id,
                                                    std::uint64_t generation) {
  std::lock_guard lock(mutex_);
  if (controller_id_ != controller_id || !in_flight_ ||
      in_flight_->generation != generation) {
    return std::nullopt;
  }
  in_flight_.reset();
  if (!pending_) return std::nullopt;
  pending_->skipped_frames = pending_skipped_frames_;
  skipped_frames_ += pending_skipped_frames_;
  pending_skipped_frames_ = 0;
  in_flight_ = std::move(*pending_);
  pending_.reset();
  return in_flight_;
}

std::uint64_t ScopeManager::skipped_frames() const {
  std::lock_guard lock(mutex_);
  return skipped_frames_;
}

}  // namespace linuxcnc::server
