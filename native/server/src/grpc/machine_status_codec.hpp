#pragma once

#include <cstdint>
#include <optional>

#include "linuxcnc/v1/linuxcnc.grpc.pb.h"
#include "linuxcnc_grpc/nml_adapter.hpp"

namespace linuxcnc::server::detail {

void fill_status(const NmlStatusSnapshot& source,
                 ::linuxcnc::v1::LinuxCNCStat* target);

bool status_equal(const NmlStatusSnapshot& left,
                  const NmlStatusSnapshot& right);

std::optional<::linuxcnc::v1::LinuxCNCStatDelta> make_status_delta(
    const NmlStatusSnapshot& previous, const NmlStatusSnapshot& current,
    std::uint64_t sequence);

}  // namespace linuxcnc::server::detail
