#pragma once

#include <cstdint>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace linuxcnc::server {

struct ScopeFrame {
  std::uint64_t generation = 0;
  std::vector<std::uint8_t> payload;
  std::uint64_t skipped_frames = 0;
};

// Owns the non-realtime part of scope streaming. There is at most one frame
// in flight and one coalesced pending frame; publishing never performs I/O.
class ScopeManager {
 public:
  bool acquire(const std::string& controller_id);
  void release(const std::string& controller_id);
  bool acquired() const;
  std::optional<ScopeFrame> publish(std::vector<std::uint8_t> payload);
  std::optional<ScopeFrame> acknowledge(const std::string& controller_id,
                                        std::uint64_t generation);
  std::uint64_t skipped_frames() const;

 private:
  mutable std::mutex mutex_;
  std::string controller_id_;
  std::optional<ScopeFrame> in_flight_;
  std::optional<ScopeFrame> pending_;
  std::uint64_t next_generation_ = 1;
  std::uint64_t skipped_frames_ = 0;
  std::uint64_t pending_skipped_frames_ = 0;
};

}  // namespace linuxcnc::server
