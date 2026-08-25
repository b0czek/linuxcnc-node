#pragma once

#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

namespace linuxcnc::server {

enum class HalScalarType { Bit, Float, S32, U32, S64, U64 };
using HalValue = std::variant<bool, double, std::int32_t, std::uint32_t,
                              std::int64_t, std::uint64_t>;

struct HalItem {
  std::string name;
  HalScalarType type = HalScalarType::Bit;
  bool pin = false;
  bool writable = false;
  HalValue value = false;
};

struct HalTopology {
  std::uint64_t generation = 0;
  std::vector<HalItem> items;
};

struct HalUpdate {
  std::string name;
  HalValue value;
};

// A typed HAL repository shared by the RPC adapters and the native component
// session. The variant preserves the exact six LinuxCNC scalar widths instead
// of converting values to JSON/double on the server boundary.
class HalRepository {
 public:
  bool add_item(HalItem item);
  bool remove_item(const std::string& name);
  bool read(const std::string& name, HalValue* value) const;
  std::vector<HalUpdate> read_many(const std::vector<std::string>& names) const;
  bool write(const std::string& name, HalValue value);
  std::size_t write_many(const std::vector<HalUpdate>& updates);
  HalTopology topology() const;
  std::uint64_t generation() const;

 private:
  static bool same_type(HalScalarType type, const HalValue& value);

  mutable std::mutex mutex_;
  std::unordered_map<std::string, HalItem> items_;
  std::uint64_t generation_ = 0;
};

}  // namespace linuxcnc::server
