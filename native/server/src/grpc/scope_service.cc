#include "grpc/scope_service_impl.hpp"

namespace linuxcnc::server::detail {

std::unique_ptr<ManagedGrpcService> make_scope_service(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& admission, AdmissionCounter& stream_admission) {
  return make_scope_service_impl(config, worker, admission, stream_admission);
}

}  // namespace linuxcnc::server::detail
