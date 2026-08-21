#include "linuxcnc_grpc/status_hub.hpp"

#include <algorithm>

namespace linuxcnc::server {

StatusHub::StatusHub(std::size_t replay_capacity)
    : replay_capacity_(std::max<std::size_t>(1, replay_capacity)) {}

std::uint64_t StatusHub::publish(std::vector<StatusField> changed_fields) {
  std::lock_guard lock(mutex_);
  ++snapshot_.sequence;
  apply(&snapshot_.fields, changed_fields);
  replay_.push_back(StatusDelta{snapshot_.sequence, std::move(changed_fields)});
  while (replay_.size() > replay_capacity_) replay_.pop_front();
  return snapshot_.sequence;
}

void StatusHub::replace_snapshot(std::vector<StatusField> fields) {
  std::lock_guard lock(mutex_);
  ++snapshot_.sequence;
  snapshot_.fields = std::move(fields);
  replay_.clear();
}

StatusSnapshot StatusHub::snapshot() const {
  std::lock_guard lock(mutex_);
  return snapshot_;
}

StatusReplay StatusHub::replay_after(std::uint64_t sequence) const {
  std::lock_guard lock(mutex_);
  StatusReplay result;
  result.snapshot = snapshot_;
  if (sequence >= snapshot_.sequence) return result;
  if (replay_.empty() || sequence < replay_.front().sequence - 1) {
    result.snapshot_required = true;
    return result;
  }
  for (const auto& delta : replay_) {
    if (delta.sequence > sequence) result.deltas.push_back(delta);
  }
  return result;
}

std::uint64_t StatusHub::sequence() const {
  std::lock_guard lock(mutex_);
  return snapshot_.sequence;
}

void StatusHub::apply(std::vector<StatusField>* target,
                      const std::vector<StatusField>& delta) {
  for (const auto& field : delta) {
    const auto found = std::find_if(target->begin(), target->end(),
                                    [&field](const StatusField& current) {
                                      return current.id == field.id;
                                    });
    if (found == target->end()) {
      target->push_back(field);
    } else {
      *found = field;
    }
  }
}

}  // namespace linuxcnc::server
