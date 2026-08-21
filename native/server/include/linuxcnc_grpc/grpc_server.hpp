#pragma once

#include "linuxcnc_grpc/daemon_config.hpp"

namespace linuxcnc::server {

// Runs the generated linuxcnc.v1 gRPC server until shutdown. This declaration
// is only linked into the daemon when LINUXCNC_GRPC_BUILD_WIRE is enabled.
int run_grpc_server(const DaemonConfig& config);

}  // namespace linuxcnc::server
