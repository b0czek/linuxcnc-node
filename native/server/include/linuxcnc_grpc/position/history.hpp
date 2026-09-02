#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <mutex>
#include <optional>
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
  std::uint64_t first_sequence = 0;
  std::uint64_t next_sequence = 0;
  // Delta consumers remove this many points from their current tail before
  // appending packed. Replacement snapshots always leave this at zero.
  std::uint32_t replace_count = 0;
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
    // The first sequence in a chain of tail replacements. This lets a
    // coalesced delta distinguish replacing a point the consumer has seen
    // from replacing an intermediate point it has not seen.
    std::optional<std::uint64_t> replacement_root;
  };

  static bool changed(const PositionSample& a, const PositionSample& b,
                      double epsilon);
  static bool collinear(const PositionSample& current,
                        const PositionSample& previous,
                        const PositionSample& penultimate);
  static void append_packed(const PositionSample& sample,
                            std::vector<double>* packed);

  mutable std::mutex mutex_;
  std::deque<Entry> entries_;
  std::size_t max_samples_;
  double epsilon_;
  std::uint64_t next_sequence_ = 0;
  std::uint64_t generation_ = 1;
};

}  // namespace linuxcnc::server
