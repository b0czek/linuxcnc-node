#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <vector>

namespace linuxcnc::server {

inline constexpr std::size_t kPositionStride = 10;

struct PositionSample {
  std::array<double, 9> coordinates{};
  std::int32_t motion_type = 0;
};

struct PositionHistoryBatch {
  bool reset = false;
  // A replacement is always emitted by snapshot(). Delta consumers compare
  // this generation with the generation they last acknowledged.
  std::uint64_t generation = 0;
  std::uint64_t oldest_sequence = 0;
  std::uint64_t next_sequence = 0;
  std::vector<double> packed;
};

// Bounded, cursor-addressable history used by both the gRPC position service
// and local consumers.  It stores the same ten-double layout as the stable
// TypeScript POSITION_STRIDE representation, but has no JavaScript types.
class PositionHistory {
 public:
  explicit PositionHistory(std::size_t max_samples = 10000,
                           double epsilon = 1e-6);

  void configure(std::size_t max_samples, double epsilon = 1e-6);
  void clear();
  bool append(const PositionSample& sample);
  PositionHistoryBatch snapshot() const;
  PositionHistoryBatch since(std::uint64_t sequence,
                             std::size_t max_samples = 0,
                             std::uint64_t after_generation = 0) const;
  std::size_t size() const;
  std::uint64_t next_sequence() const;

 private:
  struct Entry {
    std::uint64_t sequence = 0;
    PositionSample sample;
  };

  static bool changed(const PositionSample& a, const PositionSample& b,
                      double epsilon);
  static void append_packed(const PositionSample& sample,
                            std::vector<double>* packed);

  mutable std::mutex mutex_;
  std::vector<Entry> entries_;
  std::size_t max_samples_;
  double epsilon_;
  std::uint64_t next_sequence_ = 0;
  std::uint64_t generation_ = 1;
};

}  // namespace linuxcnc::server
