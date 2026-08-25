#pragma once

#include "linuxcnc_grpc/hal_value_telemetry.hpp"

#include <cstddef>
#include <cstdint>
#include <vector>

namespace linuxcnc::server {

inline constexpr std::size_t kHalTelemetryHeaderSize = 32;
inline constexpr std::size_t kHalTelemetryEntrySize = 16;
inline constexpr std::uint8_t kHalTelemetryVersion = 1;

enum class HalTelemetryFrameKind : std::uint8_t { Replacement = 1, Delta = 2 };

std::vector<std::uint8_t> encode_hal_telemetry_frame(
    const HalTelemetrySnapshot& snapshot, HalTelemetryFrameKind kind,
    const std::vector<std::size_t>& indexes = {});

}  // namespace linuxcnc::server
