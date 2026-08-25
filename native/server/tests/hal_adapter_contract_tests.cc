#include <cassert>
#include <cstdint>
#include <limits>
#include <type_traits>

#include "linuxcnc_grpc/hal_adapter.hpp"

using namespace linuxcnc::server;

int main() {
  static_assert(std::is_move_constructible_v<LinuxCncHalComponent>);
  static_assert(!std::is_copy_constructible_v<LinuxCncHalComponent>);
  static_assert(std::is_move_constructible_v<LinuxCncHalAdapter>);
  static_assert(!std::is_copy_constructible_v<LinuxCncHalAdapter>);

  // The wire adapter must not narrow the two 64-bit HAL scalar types. These
  // values are deliberately outside JavaScript's exact-integer range.
  const HalAdapterValue signed_value =
      std::int64_t{std::numeric_limits<std::int64_t>::min()};
  const HalAdapterValue unsigned_value =
      std::uint64_t{std::numeric_limits<std::uint64_t>::max()};
  assert(std::get<std::int64_t>(signed_value) ==
         std::numeric_limits<std::int64_t>::min());
  assert(std::get<std::uint64_t>(unsigned_value) ==
         std::numeric_limits<std::uint64_t>::max());

  HalAdapterSignalInfo signal;
  signal.bidirs = 3;
  assert(signal.bidirs == 3);

  HalAdapterReference reference{HalAdapterItemKind::Signal, "machine.enable"};
  assert(reference.kind == HalAdapterItemKind::Signal);
  assert(reference.name == "machine.enable");
  return 0;
}
