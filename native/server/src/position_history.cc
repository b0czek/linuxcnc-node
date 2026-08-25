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
  const auto sequence = next_sequence_++;
  if (entries_.size() >= 2 &&
      sample.motion_type == entries_.back().sample.motion_type &&
      sample.motion_type == entries_[entries_.size() - 2].sample.motion_type &&
      collinear(sample, entries_.back().sample,
                entries_[entries_.size() - 2].sample)) {
    const auto replacement_root =
        entries_.back().replacement_root.value_or(entries_.back().sequence);
    entries_.back() = Entry{sequence, sample, replacement_root};
  } else {
    entries_.push_back(Entry{sequence, sample, std::nullopt});
  }
  if (entries_.size() > max_samples_) entries_.erase(entries_.begin());
  return true;
}

PositionHistoryBatch PositionHistory::snapshot() const {
  std::lock_guard lock(mutex_);
  PositionHistoryBatch result;
  result.reset = true;
  result.generation = generation_;
  result.first_sequence =
      entries_.empty() ? next_sequence_ : entries_.front().sequence;
  result.next_sequence = next_sequence_;
  result.packed.reserve(entries_.size() * kPositionStride);
  for (const auto& entry : entries_)
    append_packed(entry.sample, &result.packed);
  return result;
}

PositionHistoryBatch PositionHistory::since(
    std::uint64_t sequence, std::size_t max_samples,
    std::uint64_t after_generation) const {
  std::lock_guard lock(mutex_);
  PositionHistoryBatch result;
  result.generation = generation_;
  result.next_sequence = next_sequence_;
  const auto oldest_sequence =
      entries_.empty() ? next_sequence_ : entries_.front().sequence;
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
  const auto first =
      (generation_changed || rolled)
          ? entries_.begin()
          : std::lower_bound(entries_.begin(), entries_.end(), sequence,
                             [](const Entry& entry, std::uint64_t value) {
                               return entry.sequence < value;
                             });
  const auto count =
      max_samples == 0
          ? static_cast<std::size_t>(entries_.end() - first)
          : std::min(max_samples,
                     static_cast<std::size_t>(entries_.end() - first));
  result.first_sequence =
      first == entries_.end() ? next_sequence_ : first->sequence;
  if (!result.reset && first != entries_.end() && first->replacement_root &&
      *first->replacement_root < sequence) {
    result.replace_count = 1;
  }
  result.packed.reserve(count * kPositionStride);
  for (auto it = first; it != first + static_cast<std::ptrdiff_t>(count);
       ++it) {
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
    if (!std::isfinite(a.coordinates[i]) || !std::isfinite(b.coordinates[i])) {
      const bool same_non_finite =
          (std::isnan(a.coordinates[i]) && std::isnan(b.coordinates[i])) ||
          a.coordinates[i] == b.coordinates[i];
      if (!same_non_finite) return true;
      continue;
    }
    if (std::abs(a.coordinates[i] - b.coordinates[i]) > epsilon) return true;
  }
  return a.motion_type != b.motion_type;
}

bool PositionHistory::collinear(const PositionSample& current,
                                const PositionSample& previous,
                                const PositionSample& penultimate) {
  constexpr double kCollinearityEpsilon = 1e-4;
  constexpr double kTiny = 1e-10;
  double current_length_squared = 0.0;
  double previous_length_squared = 0.0;
  double dot = 0.0;
  for (std::size_t index = 0; index < 3; ++index) {
    const double current_delta =
        current.coordinates[index] - previous.coordinates[index];
    const double previous_delta =
        previous.coordinates[index] - penultimate.coordinates[index];
    if (!std::isfinite(current_delta) || !std::isfinite(previous_delta)) {
      return false;
    }
    current_length_squared += current_delta * current_delta;
    previous_length_squared += previous_delta * previous_delta;
    dot += current_delta * previous_delta;
  }
  const double current_length = std::sqrt(current_length_squared);
  const double previous_length = std::sqrt(previous_length_squared);
  if (current_length < kTiny || previous_length < kTiny) return true;
  return std::abs(1.0 - dot / current_length / previous_length) <
         kCollinearityEpsilon;
}

void PositionHistory::append_packed(const PositionSample& sample,
                                    std::vector<double>* packed) {
  packed->insert(packed->end(), sample.coordinates.begin(),
                 sample.coordinates.end());
  packed->push_back(static_cast<double>(sample.motion_type));
}

}  // namespace linuxcnc::server
