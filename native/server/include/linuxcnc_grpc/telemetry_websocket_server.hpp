#pragma once

#include <memory>

namespace linuxcnc::server {

struct DaemonConfig;
class PositionTelemetry;
class HalValueTelemetry;
class ProgramWorkspaceStore;
class BoundedExecutor;
class AdmissionCounter;

class TelemetryWebSocketServer {
 public:
  TelemetryWebSocketServer(const DaemonConfig& config,
                           std::shared_ptr<PositionTelemetry> telemetry,
                           std::shared_ptr<HalValueTelemetry> hal_telemetry,
                           std::shared_ptr<ProgramWorkspaceStore> workspaces,
                           BoundedExecutor& parser_worker,
                           AdmissionCounter& preview_admission);
  ~TelemetryWebSocketServer();

  TelemetryWebSocketServer(const TelemetryWebSocketServer&) = delete;
  TelemetryWebSocketServer& operator=(const TelemetryWebSocketServer&) = delete;

  void stop();

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace linuxcnc::server
