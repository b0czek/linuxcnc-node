#pragma once

#include "grpc/server/service_factories.hpp"

namespace linuxcnc::server::detail {

std::unique_ptr<ManagedGrpcService> make_hal_service_impl(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& component_admission, AdmissionCounter& stream_admission,
    std::shared_ptr<HalValueTelemetry> telemetry);

}  // namespace linuxcnc::server::detail
