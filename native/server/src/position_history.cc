#include "linuxcnc_grpc/position_history.hpp"

#include <algorithm>
#include <cmath>

namespace linuxcnc::server {

PositionHistory::PositionHistory(std::size_t max_samples, double epsilon)
    : max_samples_(std::max<std::size_t>(1, max_samples)),
      epsilon_(std::max(0.0, epsilon)) {}

void PositionHistory::configure(std::size_t max_samples, double epsilon) {
  std::lock_guard lock(mutex_);
  max_samples_ = std::max<std::size_t>(1, max_samples);
  epsilon_ = std::max(0.0, epsilon);
  if (entries_.size() > max_samples_) {
    entries_.erase(entries_.begin(), entries_.end() - max_samples_);
  }
  ++generation_;
}

void PositionHistory::clear() {
  std::lock_guard lock(mutex_);
  entries_.clear();
  ++generation_;
}

bool PositionHistory::append(const PositionSample& sample) {
  std::lock_guard lock(mutex_);
  if (!entries_.empty() && !changed(entries_.back().sample, sample, epsilon_)) {
    return false;
  }
  entries_.push_back(Entry{next_sequence_++, sample});
  if (entries_.size() > max_samples_) entries_.erase(entries_.begin());
  return true;
}

PositionHistoryBatch PositionHistory::snapshot() const {
  std::lock_guard lock(mutex_);
  PositionHistoryBatch result;
  result.reset = true;
  result.generation = generation_;
  result.first_sequence = entries_.empty() ? next_sequence_ : entries_.front().sequence;
  result.next_sequence = next_sequence_;
  result.packed.reserve(entries_.size() * kPositionStride);
  for (const auto& entry : entries_) append_packed(entry.sample, &result.packed);
  return result;
}

PositionHistoryBatch PositionHistory::since(std::uint64_t sequence,
                                            std::size_t max_samples,
                                            std::uint64_t after_generation) const {
  std::lock_guard lock(mutex_);
  PositionHistoryBatch result;
  result.generation = generation_;
  result.next_sequence = next_sequence_;
  const auto oldest_sequence = entries_.empty() ? next_sequence_ : entries_.front().sequence;
  result.first_sequence = oldest_sequence;
  if (entries_.empty()) {
    result.reset = (after_generation != 0 && after_generation != generation_) ||
                   sequence != next_sequence_;
    return result;
  }

  const bool generation_changed =
      after_generation != 0 && after_generation != generation_;
  const bool rolled = sequence < oldest_sequence;
  result.reset = generation_changed || rolled;
  const auto first = (generation_changed || rolled) ? entries_.begin() :
                             std::lower_bound(entries_.begin(), entries_.end(), sequence,
                               [](const Entry& entry, std::uint64_t value) {
                                 return entry.sequence < value;
                               });
  const auto count = max_samples == 0
      ? static_cast<std::size_t>(entries_.end() - first)
      : std::min(max_samples, static_cast<std::size_t>(entries_.end() - first));
  result.first_sequence = first == entries_.end() ? next_sequence_ : first->sequence;
  result.packed.reserve(count * kPositionStride);
  for (auto it = first; it != first + static_cast<std::ptrdiff_t>(count); ++it) {
    append_packed(it->sample, &result.packed);
  }
  return result;
}

std::size_t PositionHistory::size() const {
  std::lock_guard lock(mutex_);
  return entries_.size();
}

std::uint64_t PositionHistory::next_sequence() const {
  std::lock_guard lock(mutex_);
  return next_sequence_;
}

bool PositionHistory::changed(const PositionSample& a, const PositionSample& b,
                              double epsilon) {
  for (std::size_t i = 0; i < a.coordinates.size(); ++i) {
    if (std::abs(a.coordinates[i] - b.coordinates[i]) > epsilon) return true;
  }
  return a.motion_type != b.motion_type;
}

void PositionHistory::append_packed(const PositionSample& sample,
                                    std::vector<double>* packed) {
  packed->insert(packed->end(), sample.coordinates.begin(), sample.coordinates.end());
  packed->push_back(static_cast<double>(sample.motion_type));
}

}  // namespace linuxcnc::server
