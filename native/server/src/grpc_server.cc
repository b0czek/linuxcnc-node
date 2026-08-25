#include "linuxcnc_grpc/grpc_server.hpp"

#include <grpcpp/ext/proto_server_reflection_plugin.h>
#include <grpcpp/grpcpp.h>
#include <grpcpp/health_check_service_interface.h>
#include <grpcpp/resource_quota.h>
#include <pthread.h>

#include <csignal>
#include <fstream>
#include <iostream>
#include <iterator>
#include <memory>
#include <string>
#include <utility>

#include "grpc/server_runtime.hpp"
#include "grpc/service_factories.hpp"
#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/hal_value_telemetry.hpp"
#include "linuxcnc_grpc/position_telemetry.hpp"
#include "linuxcnc_grpc/position_telemetry_server.hpp"
#include "linuxcnc_grpc/program_workspace.hpp"

namespace linuxcnc::server {
namespace {

constexpr int kMaxGrpcMessageBytes = 16 * 1024 * 1024 + 64 * 1024;
constexpr int kMaxGrpcThreads = 64;

std::string read_file(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) return {};
  return {std::istreambuf_iterator<char>(input),
          std::istreambuf_iterator<char>()};
}

}  // namespace

int run_grpc_server(const DaemonConfig& config) {
  std::string error;
  if (!validate_config(config, &error)) {
    std::cerr << "linuxcnc-grpc-server: " << error << '\n';
    return 2;
  }

  sigset_t shutdown_signals;
  sigemptyset(&shutdown_signals);
  sigaddset(&shutdown_signals, SIGINT);
  sigaddset(&shutdown_signals, SIGTERM);
  if (pthread_sigmask(SIG_BLOCK, &shutdown_signals, nullptr) != 0) {
    std::cerr << "linuxcnc-grpc-server: failed to block shutdown signals\n";
    return 2;
  }

  ::grpc::EnableDefaultHealthCheckService(true);
  if (config.reflection)
    ::grpc::reflection::InitProtoReflectionServerBuilderPlugin();

  try {
    auto workspaces = std::make_shared<ProgramWorkspaceStore>(
        config.workspace_root, config.active_program_directory,
        WorkspaceLimits{config.workspace_quota_bytes, config.total_quota_bytes,
                        config.workspace_ttl});
    BoundedExecutor blocking(4, 128, 8);
    BoundedExecutor parser_worker(1, 8);
    BoundedExecutor hal_worker(1, 128, 16);
    BoundedExecutor scope_worker(1, 128, 8);
    AdmissionCounter stream_admission(128);
    AdmissionCounter upload_admission(4);
    AdmissionCounter component_admission(16);
    AdmissionCounter scope_admission(1);
    auto position_telemetry = std::make_shared<PositionTelemetry>(10000);
    auto hal_telemetry = std::make_shared<HalValueTelemetry>(128);
    auto machine = detail::make_machine_service(
        config, workspaces, position_telemetry, blocking, stream_admission);
    auto program = detail::make_program_service(config, workspaces, blocking,
                                                parser_worker, upload_admission,
                                                stream_admission);
    auto hal = detail::make_hal_service(config, hal_worker, component_admission,
                                        stream_admission, hal_telemetry);
    auto scope = detail::make_scope_service(config, scope_worker,
                                            scope_admission, stream_admission);
    auto position_websocket = std::make_unique<PositionTelemetryServer>(
        config, position_telemetry, hal_telemetry);

    ::grpc::ServerBuilder builder;
    ::grpc::ResourceQuota resource_quota;
    resource_quota.Resize(std::size_t{256} * 1024U * 1024U);
    resource_quota.SetMaxThreads(kMaxGrpcThreads);
    builder.SetResourceQuota(resource_quota);
    builder.SetMaxReceiveMessageSize(kMaxGrpcMessageBytes);
    builder.SetMaxSendMessageSize(kMaxGrpcMessageBytes);

    std::shared_ptr<::grpc::ServerCredentials> credentials;
    if (!config.tls) {
      credentials = ::grpc::InsecureServerCredentials();
    } else {
      ::grpc::SslServerCredentialsOptions options;
      options.pem_key_cert_pairs.push_back({read_file(config.tls_private_key),
                                            read_file(config.tls_certificate)});
      options.pem_root_certs = read_file(config.tls_client_ca);
      if (options.pem_key_cert_pairs.front().private_key.empty() ||
          options.pem_key_cert_pairs.front().cert_chain.empty()) {
        std::cerr
            << "linuxcnc-grpc-server: failed to read TLS key/certificate\n";
        return 2;
      }
      if (config.mtls) {
        options.client_certificate_request =
            GRPC_SSL_REQUEST_AND_REQUIRE_CLIENT_CERTIFICATE_AND_VERIFY;
      }
      credentials = ::grpc::SslServerCredentials(options);
    }

    builder.AddListeningPort(config.endpoint, credentials);
    builder.RegisterService(machine->service());
    builder.RegisterService(program->service());
    builder.RegisterService(hal->service());
    builder.RegisterService(scope->service());
    auto server = builder.BuildAndStart();
    if (!server) {
      std::cerr << "linuxcnc-grpc-server: failed to bind " << config.endpoint
                << '\n';
      return 2;
    }
    std::cout << "linuxcnc-grpc-server listening on " << config.endpoint
              << " and telemetry on ws://" << config.telemetry_endpoint
              << std::endl;

    detail::ServerRuntime runtime(
        std::move(server), std::move(machine), std::move(program),
        std::move(hal), std::move(scope), std::move(position_websocket),
        std::move(position_telemetry), std::move(hal_telemetry),
        stream_admission, upload_admission, component_admission,
        scope_admission, blocking, parser_worker, hal_worker, scope_worker);
    runtime.start_control_thread(shutdown_signals);
    runtime.wait();
    runtime.finalize();
    return 0;
  } catch (const std::exception& exception) {
    std::cerr << "linuxcnc-grpc-server: initialization failed: "
              << exception.what() << '\n';
    return 2;
  }
}

}  // namespace linuxcnc::server
