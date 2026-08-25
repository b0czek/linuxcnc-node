#pragma once

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <string>

namespace linuxcnc::server {

struct DaemonConfig {
  std::string endpoint = "127.0.0.1:50051";
  std::string telemetry_endpoint = "127.0.0.1:50052";
  std::filesystem::path ini_file;
  std::filesystem::path nml_file;
  std::filesystem::path workspace_root = "/var/lib/linuxcnc-grpc/workspaces";
  std::filesystem::path active_program_directory =
      "/var/lib/linuxcnc-grpc/active-program";
  std::filesystem::path tls_certificate;
  std::filesystem::path tls_private_key;
  std::filesystem::path tls_client_ca;
  std::size_t workspace_quota_bytes = 256U * 1024U * 1024U;
  std::size_t total_quota_bytes = 1024U * 1024U * 1024U;
  std::chrono::seconds workspace_ttl{24 * 60 * 60};
  std::size_t command_queue_capacity = 128;
  std::size_t status_replay_capacity = 256;
  std::size_t gcode_batch_size = 128;
  std::size_t scope_samples = 32000;
  std::chrono::milliseconds status_period{50};
  std::chrono::milliseconds error_period{100};
  std::chrono::milliseconds position_period{10};
  std::chrono::milliseconds topology_period{2000};
  std::chrono::milliseconds scope_period{20};
  std::chrono::milliseconds scope_heartbeat{100};
  bool tls = false;
  bool mtls = false;
  bool reflection = false;
  bool unsafe_non_loopback = false;
};

// Parses the daemon's intentionally small process-level configuration. gRPC
// credentials are loaded by the control-plane adapter; telemetry is
// always plaintext WebSocket. This object validates both endpoint policies
// before either socket can be bound.
bool validate_config(const DaemonConfig& config, std::string* error = nullptr);
bool validate_program_prefix(const std::filesystem::path& ini_file,
                             const std::filesystem::path& active_directory,
                             std::string* error = nullptr);
bool parse_config(int argc, char* argv[], DaemonConfig* config,
                  bool* show_help = nullptr, std::string* error = nullptr);
std::string config_help();

}  // namespace linuxcnc::server
