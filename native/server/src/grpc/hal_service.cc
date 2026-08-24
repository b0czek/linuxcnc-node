#include "grpc/hal_service_impl.hpp"

namespace linuxcnc::server::detail {

std::unique_ptr<ManagedGrpcService> make_hal_service(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& component_admission, AdmissionCounter& stream_admission) {
  return make_hal_service_impl(config, worker, component_admission,
                               stream_admission);
}

}  // namespace linuxcnc::server::detail
