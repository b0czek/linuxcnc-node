#pragma once

#include <cstdint>
#include <deque>
#include <mutex>
#include <string>
#include <variant>
#include <vector>

namespace linuxcnc::server {

using StatusValue =
    std::variant<bool, std::int32_t, std::uint32_t, std::int64_t, std::uint64_t,
                 double, std::string>;

struct StatusField {
  std::uint32_t id = 0;
  StatusValue value;
};

struct StatusSnapshot {
  std::uint64_t sequence = 0;
  std::vector<StatusField> fields;
};

struct StatusDelta {
  std::uint64_t sequence = 0;
  std::vector<StatusField> fields;
};

struct StatusReplay {
  bool snapshot_required = false;
  StatusSnapshot snapshot;
  std::vector<StatusDelta> deltas;
};

// Keeps a complete typed snapshot and a bounded replay window. Field ids are
// assigned by the protobuf/domain contract; no string property paths are
// stored here.
class StatusHub {
 public:
  explicit StatusHub(std::size_t replay_capacity = 256);

  std::uint64_t publish(std::vector<StatusField> changed_fields);
  void replace_snapshot(std::vector<StatusField> fields);
  StatusSnapshot snapshot() const;
  StatusReplay replay_after(std::uint64_t sequence) const;
  std::uint64_t sequence() const;

 private:
  static void apply(std::vector<StatusField>* target,
                    const std::vector<StatusField>& delta);

  const std::size_t replay_capacity_;
  mutable std::mutex mutex_;
  StatusSnapshot snapshot_;
  std::deque<StatusDelta> replay_;
};

}  // namespace linuxcnc::server
