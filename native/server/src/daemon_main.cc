#include "linuxcnc_grpc/daemon_config.hpp"

#ifdef LINUXCNC_GRPC_BUILD_WIRE
#include "linuxcnc_grpc/grpc_server.hpp"
#endif

#include <iostream>

int main(int argc, char* argv[]) {
  linuxcnc::server::DaemonConfig config;
  bool show_help = false;
  std::string error;
  if (!linuxcnc::server::parse_config(argc, argv, &config, &show_help, &error)) {
    std::cerr << "linuxcnc-grpc-server: " << error << '\n';
    return 2;
  }
  if (show_help) {
    std::cout << linuxcnc::server::config_help();
    return 0;
  }
#ifdef LINUXCNC_GRPC_BUILD_WIRE
  if (config.ini_file.empty()) {
    std::cerr << "linuxcnc-grpc-server: --ini is required for the wire daemon\n";
    return 2;
  }
  if (config.nml_file.empty()) {
    std::cerr << "linuxcnc-grpc-server: --nml is required for the wire daemon\n";
    return 2;
  }
  if (!std::filesystem::is_regular_file(config.nml_file)) {
    std::cerr << "linuxcnc-grpc-server: NML configuration is not a regular file: "
              << config.nml_file << '\n';
    return 2;
  }
#endif
  if (!config.ini_file.empty()) {
    if (!linuxcnc::server::validate_program_prefix(config.ini_file,
                                                   config.active_program_directory,
                                                   &error)) {
      std::cerr << "linuxcnc-grpc-server: " << error << '\n';
      return 2;
    }
  }
#ifdef LINUXCNC_GRPC_BUILD_WIRE
  return linuxcnc::server::run_grpc_server(config);
#else
  std::cerr << "linuxcnc-grpc-server: generated gRPC transport is not linked; "
               "configuration validation succeeded only\n";
  return 78;
#endif
}
