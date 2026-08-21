#pragma once

#include "linuxcnc_grpc/hal_adapter.hpp"

#include "linuxcnc/v1/linuxcnc.pb.h"

#include <optional>

namespace linuxcnc::server {

std::optional<HalAdapterReference> decode_hal_reference(
    const linuxcnc::v1::HalItemRef& source);
std::optional<HalAdapterValue> decode_hal_scalar(
    const linuxcnc::v1::HalScalar& source);
void encode_hal_scalar(const HalAdapterValue& source,
                       linuxcnc::v1::HalScalar* target);
void encode_hal_topology(const HalAdapterTopology& source,
                         linuxcnc::v1::HalTopology* target);

}  // namespace linuxcnc::server
