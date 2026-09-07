#include "scope/grpc/service_impl.hpp"

namespace linuxcnc::server::detail {

std::unique_ptr<ManagedGrpcService> make_scope_service(
    const DaemonConfig& config, BoundedExecutor& worker,
    std::shared_ptr<ScopeTelemetry> scope_telemetry) {
  return make_scope_service_impl(config, worker, std::move(scope_telemetry));
}

}  // namespace linuxcnc::server::detail
