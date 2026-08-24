#pragma once

#include "server_service.hpp"

#include <memory>

namespace linuxcnc::server {

class BoundedExecutor;
class AdmissionCounter;
class PositionTelemetry;
class ProgramWorkspaceStore;
struct DaemonConfig;

}  // namespace linuxcnc::server

namespace linuxcnc::server::detail {

std::unique_ptr<ManagedGrpcService> make_machine_service(
    const DaemonConfig& config, std::shared_ptr<ProgramWorkspaceStore> workspaces,
    std::shared_ptr<PositionTelemetry> positions, BoundedExecutor& blocking,
    AdmissionCounter& stream_admission);

std::unique_ptr<ManagedGrpcService> make_program_service(
    const DaemonConfig& config, std::shared_ptr<ProgramWorkspaceStore> store,
    BoundedExecutor& blocking, BoundedExecutor& parser_worker,
    AdmissionCounter& upload_admission, AdmissionCounter& stream_admission);

std::unique_ptr<ManagedGrpcService> make_hal_service(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& component_admission, AdmissionCounter& stream_admission);

std::unique_ptr<ManagedGrpcService> make_scope_service(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& admission, AdmissionCounter& stream_admission);

}  // namespace linuxcnc::server::detail
