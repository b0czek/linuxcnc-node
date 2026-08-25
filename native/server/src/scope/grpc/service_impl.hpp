#pragma once

#include "grpc/server/service_factories.hpp"

namespace linuxcnc::server::detail {

std::unique_ptr<ManagedGrpcService> make_scope_service_impl(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& admission, AdmissionCounter& stream_admission);

}  // namespace linuxcnc::server::detail
