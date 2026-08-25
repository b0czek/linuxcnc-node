#include "grpc/hal_service_impl.hpp"

#include <memory>
#include <utility>

namespace linuxcnc::server::detail {

std::unique_ptr<ManagedGrpcService> make_hal_service(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& component_admission, AdmissionCounter& stream_admission,
    std::shared_ptr<HalValueTelemetry> telemetry) {
  return make_hal_service_impl(config, worker, component_admission,
                               stream_admission, std::move(telemetry));
}

}  // namespace linuxcnc::server::detail
