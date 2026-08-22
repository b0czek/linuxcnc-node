#pragma once

#include "linuxcnc_grpc/position_history.hpp"

#include <cstdint>
#include <vector>

namespace linuxcnc::server {

inline constexpr std::size_t kPositionTelemetryHeaderSize = 40;
inline constexpr std::uint8_t kPositionTelemetryVersion = 1;

enum class PositionTelemetryFrameKind : std::uint8_t {
  Replacement = 1,
  Delta = 2,
};

std::vector<std::uint8_t> encode_position_telemetry_frame(
    const PositionHistoryBatch& batch, PositionTelemetryFrameKind kind);

}  // namespace linuxcnc::server
