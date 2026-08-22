#pragma once

#include <memory>

namespace linuxcnc::server {

struct DaemonConfig;
class PositionTelemetry;

class PositionTelemetryServer {
 public:
  PositionTelemetryServer(const DaemonConfig& config,
                          std::shared_ptr<PositionTelemetry> telemetry);
  ~PositionTelemetryServer();

  PositionTelemetryServer(const PositionTelemetryServer&) = delete;
  PositionTelemetryServer& operator=(const PositionTelemetryServer&) = delete;

  void stop();

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace linuxcnc::server
