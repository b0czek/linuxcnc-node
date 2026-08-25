#include "linuxcnc_grpc/position_telemetry_wire.hpp"

#include <cstring>
#include <limits>
#include <stdexcept>

namespace linuxcnc::server {
namespace {

template <typename T>
void write_le(std::vector<std::uint8_t>* output, std::size_t offset, T value) {
  for (std::size_t index = 0; index < sizeof(T); ++index) {
    (*output)[offset + index] = static_cast<std::uint8_t>(value & 0xffU);
    value >>= 8U;
  }
}

}  // namespace

std::vector<std::uint8_t> encode_position_telemetry_frame(
    const PositionHistoryBatch& batch, PositionTelemetryFrameKind kind) {
  if (batch.packed.size() > std::numeric_limits<std::uint32_t>::max()) {
    throw std::length_error(
        "position telemetry frame exceeds uint32 value count");
  }
  std::vector<std::uint8_t> output(kPositionTelemetryHeaderSize +
                                   batch.packed.size() * sizeof(double));
  output[0] = 'L';
  output[1] = 'C';
  output[2] = 'P';
  output[3] = 'H';
  output[4] = kPositionTelemetryVersion;
  output[5] = static_cast<std::uint8_t>(kind);
  write_le<std::uint16_t>(&output, 6,
                          static_cast<std::uint16_t>(kPositionStride));
  write_le<std::uint64_t>(&output, 8, batch.generation);
  write_le<std::uint64_t>(&output, 16, batch.first_sequence);
  write_le<std::uint64_t>(&output, 24, batch.next_sequence);
  write_le<std::uint32_t>(&output, 32,
                          static_cast<std::uint32_t>(batch.packed.size()));
  write_le<std::uint32_t>(
      &output, 36,
      kind == PositionTelemetryFrameKind::Delta ? batch.replace_count : 0);
  for (std::size_t index = 0; index < batch.packed.size(); ++index) {
    std::uint64_t bits = 0;
    static_assert(sizeof(bits) == sizeof(double));
    std::memcpy(&bits, &batch.packed[index], sizeof(bits));
    write_le<std::uint64_t>(
        &output, kPositionTelemetryHeaderSize + index * sizeof(double), bits);
  }
  return output;
}

}  // namespace linuxcnc::server
