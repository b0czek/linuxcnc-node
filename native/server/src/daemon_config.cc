#include "linuxcnc_grpc/daemon_config.hpp"

#include <charconv>
#include <cctype>
#include <fstream>
#include <sstream>

namespace linuxcnc::server {
namespace {

bool parse_size(const std::string& value, std::size_t* result) {
  const auto* first = value.data();
  const auto* last = first + value.size();
  const auto parsed = std::from_chars(first, last, *result);
  return parsed.ec == std::errc{} && parsed.ptr == last;
}

bool parse_milliseconds(const std::string& value, std::chrono::milliseconds* result) {
  std::size_t parsed = 0;
  if (!parse_size(value, &parsed)) return false;
  *result = std::chrono::milliseconds(parsed);
  return true;
}

bool option_value(const std::string& argument, const char* option, std::string* value) {
  const std::string prefix = std::string(option) + "=";
  if (argument.rfind(prefix, 0) != 0) return false;
  *value = argument.substr(prefix.size());
  return true;
}

std::string endpoint_host(const std::string& endpoint) {
  if (endpoint.empty()) return {};
  if (endpoint.front() == '[') {
    const auto end = endpoint.find(']');
    return end == std::string::npos ? std::string{} : endpoint.substr(1, end - 1);
  }
  const auto separator = endpoint.rfind(':');
  return separator == std::string::npos ? endpoint : endpoint.substr(0, separator);
}

std::string trim(std::string value) {
  while (!value.empty() && std::isspace(static_cast<unsigned char>(value.front()))) value.erase(value.begin());
  while (!value.empty() && std::isspace(static_cast<unsigned char>(value.back()))) value.pop_back();
  return value;
}

bool loopback_host(const std::string& host) {
  return host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]";
}

}  // namespace

bool validate_config(const DaemonConfig& config, std::string* error) {
  const auto fail = [error](const std::string& message) {
    if (error) *error = message;
    return false;
  };
  const auto valid_endpoint = [&](const std::string& endpoint,
                                  const char* name, bool tls_protected) {
    const auto separator = endpoint.rfind(':');
    if (separator == std::string::npos || separator == 0 ||
        separator + 1 == endpoint.size()) {
      if (error) *error = std::string(name) + " must be HOST:PORT";
      return false;
    }
    if (!tls_protected && !config.unsafe_non_loopback &&
        !loopback_host(endpoint_host(endpoint))) {
      if (error) *error = std::string(name) +
          " on a non-loopback host requires --unsafe-non-loopback";
      return false;
    }
    return true;
  };
  if (!valid_endpoint(config.endpoint, "endpoint", config.tls) ||
      !valid_endpoint(config.telemetry_endpoint,
                      "telemetry endpoint", false)) return false;
  if (config.endpoint == config.telemetry_endpoint) {
    return fail("gRPC and telemetry endpoints must differ");
  }
  if (config.mtls && !config.tls) return fail("mTLS requires TLS");
  if (config.tls && (config.tls_certificate.empty() || config.tls_private_key.empty())) {
    return fail("TLS requires --tls-certificate and --tls-private-key");
  }
  if (config.mtls && config.tls_client_ca.empty()) return fail("mTLS requires --tls-client-ca");
  if (config.tls && (!std::filesystem::is_regular_file(config.tls_certificate) ||
                     !std::filesystem::is_regular_file(config.tls_private_key))) {
    return fail("TLS certificate and private key must be regular files");
  }
  if (config.mtls && !std::filesystem::is_regular_file(config.tls_client_ca)) {
    return fail("mTLS client CA must be a regular file");
  }
  if (!config.nml_file.empty() && !std::filesystem::is_regular_file(config.nml_file)) {
    return fail("NML configuration must be a regular file");
  }
  if (config.workspace_quota_bytes == 0 || config.total_quota_bytes == 0) {
    return fail("workspace quotas must be non-zero");
  }
  if (config.command_queue_capacity == 0) return fail("command queue capacity must be non-zero");
  if (config.status_replay_capacity == 0 || config.gcode_batch_size == 0) {
    return fail("status replay and G-code batch capacities must be non-zero");
  }
  if (config.scope_samples < 1000 || config.scope_samples > 1000000) {
    return fail("scope sample count must be between 1000 and 1000000");
  }
  if (config.workspace_ttl <= std::chrono::seconds::zero() ||
      config.status_period <= std::chrono::milliseconds::zero() ||
      config.error_period <= std::chrono::milliseconds::zero() ||
      config.position_period <= std::chrono::milliseconds::zero() ||
      config.topology_period <= std::chrono::milliseconds::zero() ||
      config.scope_period <= std::chrono::milliseconds::zero() ||
      config.scope_heartbeat <= std::chrono::milliseconds::zero()) {
    return fail("daemon periods and workspace TTL must be positive");
  }
  return true;
}

bool validate_program_prefix(const std::filesystem::path& ini_file,
                             const std::filesystem::path& active_directory,
                             std::string* error) {
  const auto fail = [error](const std::string& message) {
    if (error) *error = message;
    return false;
  };
  std::ifstream input(ini_file);
  if (!input) return fail("cannot read LinuxCNC INI: " + ini_file.string());
  bool display_section = false;
  std::string line;
  std::string configured_prefix;
  while (std::getline(input, line)) {
    const auto comment = line.find_first_of("#;");
    if (comment != std::string::npos) line.resize(comment);
    line = trim(std::move(line));
    if (line.empty()) continue;
    if (line.front() == '[' && line.back() == ']') {
      auto section = trim(line.substr(1, line.size() - 2));
      for (char& character : section) character = static_cast<char>(std::toupper(static_cast<unsigned char>(character)));
      display_section = section == "DISPLAY";
      continue;
    }
    if (!display_section) continue;
    const auto equals = line.find('=');
    if (equals == std::string::npos) continue;
    auto key = trim(line.substr(0, equals));
    for (char& character : key) character = static_cast<char>(std::toupper(static_cast<unsigned char>(character)));
    if (key == "PROGRAM_PREFIX") {
      configured_prefix = trim(line.substr(equals + 1));
      break;
    }
  }
  if (configured_prefix.empty()) return fail("[DISPLAY] PROGRAM_PREFIX is missing from LinuxCNC INI");
  std::filesystem::path configured_path(configured_prefix);
  if (configured_path.is_relative()) configured_path = ini_file.parent_path() / configured_path;
  const auto configured = std::filesystem::weakly_canonical(std::filesystem::absolute(configured_path));
  const auto expected = std::filesystem::weakly_canonical(std::filesystem::absolute(active_directory));
  if (configured != expected) {
    return fail("LinuxCNC PROGRAM_PREFIX does not match active program directory");
  }
  return true;
}

bool parse_config(int argc, char* argv[], DaemonConfig* config, bool* show_help,
                  std::string* error) {
  if (!config) {
    if (error) *error = "configuration output is null";
    return false;
  }
  if (show_help) *show_help = false;
  for (int index = 1; index < argc; ++index) {
    const std::string argument(argv[index]);
    if (argument == "--help" || argument == "-h") {
      if (show_help) *show_help = true;
      continue;
    }
    if (argument == "--tls") { config->tls = true; continue; }
    if (argument == "--mtls") { config->mtls = true; continue; }
    if (argument == "--reflection") { config->reflection = true; continue; }
    if (argument == "--unsafe-non-loopback") { config->unsafe_non_loopback = true; continue; }

    std::string value;
    if (option_value(argument, "--endpoint", &value)) config->endpoint = value;
    else if (option_value(argument, "--telemetry-endpoint", &value)) {
      config->telemetry_endpoint = value;
    }
    else if (option_value(argument, "--ini", &value)) config->ini_file = value;
    else if (option_value(argument, "--nml", &value)) config->nml_file = value;
    else if (option_value(argument, "--workspace-root", &value)) config->workspace_root = value;
    else if (option_value(argument, "--active-program-directory", &value)) config->active_program_directory = value;
    else if (option_value(argument, "--tls-certificate", &value)) config->tls_certificate = value;
    else if (option_value(argument, "--tls-private-key", &value)) config->tls_private_key = value;
    else if (option_value(argument, "--tls-client-ca", &value)) config->tls_client_ca = value;
    else if (option_value(argument, "--workspace-quota", &value)) {
      if (!parse_size(value, &config->workspace_quota_bytes)) {
        if (error) *error = "invalid --workspace-quota";
        return false;
      }
    } else if (option_value(argument, "--total-quota", &value)) {
      if (!parse_size(value, &config->total_quota_bytes)) {
        if (error) *error = "invalid --total-quota";
        return false;
      }
    } else if (option_value(argument, "--workspace-ttl-seconds", &value)) {
      std::size_t seconds = 0;
      if (!parse_size(value, &seconds) || seconds == 0) {
        if (error) *error = "invalid --workspace-ttl-seconds";
        return false;
      }
      config->workspace_ttl = std::chrono::seconds(seconds);
    } else if (option_value(argument, "--command-queue-capacity", &value)) {
      if (!parse_size(value, &config->command_queue_capacity)) {
        if (error) *error = "invalid --command-queue-capacity";
        return false;
      }
    } else if (option_value(argument, "--status-replay-capacity", &value)) {
      if (!parse_size(value, &config->status_replay_capacity)) {
        if (error) *error = "invalid --status-replay-capacity";
        return false;
      }
    } else if (option_value(argument, "--gcode-batch-size", &value)) {
      if (!parse_size(value, &config->gcode_batch_size)) {
        if (error) *error = "invalid --gcode-batch-size";
        return false;
      }
    } else if (option_value(argument, "--scope-samples", &value)) {
      if (!parse_size(value, &config->scope_samples)) {
        if (error) *error = "invalid --scope-samples";
        return false;
      }
    } else if (option_value(argument, "--status-period-ms", &value)) {
      if (!parse_milliseconds(value, &config->status_period)) {
        if (error) *error = "invalid --status-period-ms";
        return false;
      }
    } else if (option_value(argument, "--error-period-ms", &value)) {
      if (!parse_milliseconds(value, &config->error_period)) {
        if (error) *error = "invalid --error-period-ms";
        return false;
      }
    } else if (option_value(argument, "--position-period-ms", &value)) {
      if (!parse_milliseconds(value, &config->position_period)) {
        if (error) *error = "invalid --position-period-ms";
        return false;
      }
    } else if (option_value(argument, "--topology-period-ms", &value)) {
      if (!parse_milliseconds(value, &config->topology_period)) {
        if (error) *error = "invalid --topology-period-ms";
        return false;
      }
    } else if (option_value(argument, "--scope-period-ms", &value)) {
      if (!parse_milliseconds(value, &config->scope_period)) {
        if (error) *error = "invalid --scope-period-ms";
        return false;
      }
    } else if (option_value(argument, "--scope-heartbeat-ms", &value)) {
      if (!parse_milliseconds(value, &config->scope_heartbeat)) {
        if (error) *error = "invalid --scope-heartbeat-ms";
        return false;
      }
    } else {
      if (error) *error = "unknown option: " + argument;
      return false;
    }
  }
  return validate_config(*config, error);
}

std::string config_help() {
  return "linuxcnc-grpc-server [options]\n"
         "  --endpoint=HOST:PORT                 (default 127.0.0.1:50051)\n"
         "  --telemetry-endpoint=HOST:PORT         (default 127.0.0.1:50052)\n"
         "  --ini=PATH --nml=PATH\n"
         "  --workspace-root=PATH --active-program-directory=PATH\n"
         "  --workspace-quota=BYTES --total-quota=BYTES --workspace-ttl-seconds=N\n"
         "  --command-queue-capacity=N\n"
         "  --tls --tls-certificate=PATH --tls-private-key=PATH (gRPC only)\n"
         "  --mtls --tls-client-ca=PATH --reflection (gRPC only)\n"
         "  --status-period-ms=50 --error-period-ms=100 --position-period-ms=10\n"
         "  --topology-period-ms=2000 --scope-samples=32000\n"
         "  --scope-period-ms=20 --scope-heartbeat-ms=100\n"
         "  --unsafe-non-loopback\n";
}

}  // namespace linuxcnc::server
