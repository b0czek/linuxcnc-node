#include "linuxcnc_grpc/hal_value_telemetry_wire.hpp"

#include <cstring>
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

std::uint64_t payload(const HalTelemetryValue& value) {
  if (const auto* item = std::get_if<bool>(&value)) return *item ? 1 : 0;
  if (const auto* item = std::get_if<double>(&value)) {
    std::uint64_t bits = 0;
    std::memcpy(&bits, item, sizeof(bits));
    return bits;
  }
  if (const auto* item = std::get_if<std::int32_t>(&value))
    return static_cast<std::uint32_t>(*item);
  if (const auto* item = std::get_if<std::uint32_t>(&value)) return *item;
  if (const auto* item = std::get_if<std::int64_t>(&value))
    return static_cast<std::uint64_t>(*item);
  return std::get<std::uint64_t>(value);
}
}  // namespace

std::vector<std::uint8_t> encode_hal_telemetry_frame(
    const HalTelemetrySnapshot& snapshot, HalTelemetryFrameKind kind,
    const std::vector<std::size_t>& indexes) {
  std::vector<std::size_t> selected = indexes;
  if (selected.empty()) {
    selected.resize(snapshot.bindings.size());
    for (std::size_t index = 0; index < selected.size(); ++index)
      selected[index] = index;
  }
  std::vector<std::uint8_t> output(kHalTelemetryHeaderSize +
                                   selected.size() * kHalTelemetryEntrySize);
  output[0] = 'L';
  output[1] = 'C';
  output[2] = 'H';
  output[3] = 'V';
  output[4] = kHalTelemetryVersion;
  output[5] = static_cast<std::uint8_t>(kind);
  write_le<std::uint16_t>(&output, 6, kHalTelemetryEntrySize);
  write_le<std::uint64_t>(&output, 8, snapshot.revision);
  write_le<std::uint64_t>(&output, 16, snapshot.sequence);
  write_le<std::uint32_t>(&output, 24,
                          static_cast<std::uint32_t>(selected.size()));
  for (std::size_t entry = 0; entry < selected.size(); ++entry) {
    const auto index = selected[entry];
    if (index >= snapshot.bindings.size() || index >= snapshot.values.size())
      throw std::out_of_range("HAL telemetry entry index is out of range");
    const auto offset =
        kHalTelemetryHeaderSize + entry * kHalTelemetryEntrySize;
    write_le<std::uint32_t>(&output, offset, snapshot.bindings[index].slot);
    const auto& value = snapshot.values[index];
    if (value) {
      output[offset + 4] =
          static_cast<std::uint8_t>(snapshot.bindings[index].type);
      write_le<std::uint64_t>(&output, offset + 8, payload(value.value()));
    }
  }
  return output;
}

}  // namespace linuxcnc::server
