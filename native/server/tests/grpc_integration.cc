#include "linuxcnc/v1/linuxcnc.grpc.pb.h"

#include <grpcpp/grpcpp.h>
#include <google/protobuf/empty.pb.h>
#include <boost/asio/connect.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/websocket.hpp>

#include <cassert>
#include <memory>
#include <string>
#include <chrono>
#include <thread>
#include <vector>

namespace asio = boost::asio;
namespace beast = boost::beast;
namespace websocket = beast::websocket;
using tcp = asio::ip::tcp;

std::uint64_t read_u64_le(const std::vector<std::uint8_t>& bytes,
                          std::size_t offset) {
  std::uint64_t value = 0;
  for (unsigned index = 0; index < 8; ++index) {
    value |= static_cast<std::uint64_t>(bytes[offset + index]) << (index * 8U);
  }
  return value;
}

std::pair<std::string, std::string> split_endpoint(const std::string& endpoint) {
  const auto separator = endpoint.rfind(':');
  return {endpoint.substr(0, separator), endpoint.substr(separator + 1)};
}

std::vector<std::uint8_t> read_telemetry_frame(
    websocket::stream<beast::tcp_stream>& socket) {
  beast::flat_buffer buffer;
  socket.read(buffer);
  std::vector<std::uint8_t> bytes(buffer.size());
  asio::buffer_copy(asio::buffer(bytes), buffer.data());
  assert(bytes.size() >= 40);
  assert(bytes[0] == 'L' && bytes[1] == 'C' && bytes[2] == 'P' && bytes[3] == 'H');
  assert(bytes[4] == 2 && bytes[5] == 1);
  assert(bytes[6] == 10 && bytes[7] == 0);
  return bytes;
}

int main(int argc, char** argv) {
  const std::string endpoint = argc > 1 ? argv[1] : "127.0.0.1:50051";
  auto channel = grpc::CreateChannel(endpoint,
                                    grpc::InsecureChannelCredentials());
  auto machine = linuxcnc::v1::MachineService::NewStub(channel);
  if (argc > 2 && std::string(argv[2]) == "--hold-stream") {
    auto program = linuxcnc::v1::ProgramService::NewStub(channel);
    auto hal = linuxcnc::v1::HalService::NewStub(channel);
    auto scope = linuxcnc::v1::ScopeService::NewStub(channel);
    auto terminal_ok = [](const grpc::Status& result) {
      assert(result.error_code() == grpc::StatusCode::CANCELLED ||
             result.error_code() == grpc::StatusCode::UNAVAILABLE);
    };
    std::vector<std::thread> holders;
    holders.emplace_back([&] {
      grpc::ClientContext context; context.set_deadline(
          std::chrono::system_clock::now() + std::chrono::seconds(10));
      auto stream = machine->WatchErrors(&context, {});
      linuxcnc::v1::LinuxCNCError message;
      while (stream->Read(&message)) {}
      terminal_ok(stream->Finish());
    });
    holders.emplace_back([&] {
      grpc::ClientContext context; context.set_deadline(
          std::chrono::system_clock::now() + std::chrono::seconds(10));
      auto stream = machine->WatchStatus(&context, {});
      linuxcnc::v1::WatchStatusEvent message;
      while (stream->Read(&message)) {}
      terminal_ok(stream->Finish());
    });
    holders.emplace_back([&] {
      grpc::ClientContext context; context.set_deadline(
          std::chrono::system_clock::now() + std::chrono::seconds(10));
      auto stream = hal->WatchTopology(&context, {});
      linuxcnc::v1::WatchHalTopologyEvent message;
      while (stream->Read(&message)) {}
      terminal_ok(stream->Finish());
    });
    holders.emplace_back([&] {
      grpc::ClientContext create_context;
      linuxcnc::v1::CreateWorkspaceResponse workspace;
      assert(program->CreateWorkspace(&create_context, {}, &workspace).ok());
      grpc::ClientContext context; context.set_deadline(
          std::chrono::system_clock::now() + std::chrono::seconds(10));
      linuxcnc::v1::UploadWorkspaceResponse response;
      auto stream = program->UploadWorkspace(&context, &response);
      linuxcnc::v1::UploadWorkspaceRequest request;
      request.set_workspace_id(workspace.workspace_id());
      request.mutable_file()->set_relative_path("held.ngc");
      request.mutable_file()->set_data("G0 X0\n");
      assert(stream->Write(request));
      std::this_thread::sleep_for(std::chrono::seconds(1));
      terminal_ok(stream->Finish());
    });
    holders.emplace_back([&] {
      grpc::ClientContext context; context.set_deadline(
          std::chrono::system_clock::now() + std::chrono::seconds(10));
      auto stream = hal->ComponentSession(&context);
      linuxcnc::v1::ComponentSessionMessage response;
      while (stream->Read(&response)) {}
      terminal_ok(stream->Finish());
    });
    holders.emplace_back([&] {
      grpc::ClientContext context; context.set_deadline(
          std::chrono::system_clock::now() + std::chrono::seconds(10));
      auto stream = scope->Session(&context);
      linuxcnc::v1::ScopeSessionMessage acquire;
      acquire.mutable_acquire();
      assert(stream->Write(acquire));
      linuxcnc::v1::ScopeSessionMessage response;
      while (stream->Read(&response)) {}
      terminal_ok(stream->Finish());
    });
    for (auto& holder : holders) holder.join();
    return 0;
  }
  const std::string telemetry_endpoint = argc > 2 ? argv[2] : "127.0.0.1:50052";
  const auto [telemetry_host, telemetry_port] = split_endpoint(telemetry_endpoint);
  asio::io_context io;
  tcp::resolver resolver(io);
  websocket::stream<beast::tcp_stream> telemetry(io);
  beast::get_lowest_layer(telemetry).connect(
      resolver.resolve(telemetry_host, telemetry_port));
  telemetry.handshake(telemetry_host, "/v1/position-history");
  const auto initial_frame = read_telemetry_frame(telemetry);
  const auto initial_generation = read_u64_le(initial_frame, 8);
  grpc::ClientContext context;
  linuxcnc::v1::GetStatusResponse status;
  const auto status_result = machine->GetStatus(&context, {}, &status);
  // The integration daemon has no LinuxCNC NML instance. It must expose an
  // explicit unavailable status rather than fabricate an empty snapshot.
  assert(status_result.error_code() == grpc::StatusCode::UNAVAILABLE);

  grpc::ClientContext context2;
  linuxcnc::v1::PositionHistoryConfig config;
  config.set_enabled(true);
  config.set_capacity(32);
  google::protobuf::Empty empty;
  assert(machine->ConfigurePositionHistory(&context2, config, &empty).ok());
  const auto configured_frame = read_telemetry_frame(telemetry);
  assert(read_u64_le(configured_frame, 8) != initial_generation);
  grpc::ClientContext capacity_only_context;
  linuxcnc::v1::PositionHistoryConfig capacity_only;
  capacity_only.set_capacity(64);
  assert(machine->ConfigurePositionHistory(
      &capacity_only_context, capacity_only, &empty).ok());
  const auto capacity_only_frame = read_telemetry_frame(telemetry);
  assert(read_u64_le(capacity_only_frame, 8) != read_u64_le(configured_frame, 8));
  grpc::ClientContext oversized_context;
  config.set_capacity(100001);
  const auto oversized = machine->ConfigurePositionHistory(
      &oversized_context, config, &empty);
  assert(oversized.error_code() == grpc::StatusCode::RESOURCE_EXHAUSTED);
  grpc::ClientContext slow_sample_context;
  config.set_capacity(0);
  config.set_sample_period_ms(60001);
  const auto slow_sample = machine->ConfigurePositionHistory(
      &slow_sample_context, config, &empty);
  assert(slow_sample.error_code() == grpc::StatusCode::INVALID_ARGUMENT);

  grpc::ClientContext clear_context;
  assert(machine->ClearPositionHistory(&clear_context, empty, &empty).ok());
  const auto cleared_frame = read_telemetry_frame(telemetry);
  assert(read_u64_le(cleared_frame, 8) != read_u64_le(configured_frame, 8));
  telemetry.text(true);
  telemetry.write(asio::buffer("forbidden", 9));
  beast::flat_buffer rejected;
  beast::error_code websocket_error;
  telemetry.read(rejected, websocket_error);
  assert(websocket_error == websocket::error::closed);
  assert(telemetry.reason().code == websocket::close_code::policy_error);

  auto program = linuxcnc::v1::ProgramService::NewStub(channel);
  grpc::ClientContext context4;
  linuxcnc::v1::CreateWorkspaceResponse workspace;
  assert(program->CreateWorkspace(&context4, {}, &workspace).ok());
  assert(!workspace.workspace_id().empty());

  grpc::ClientContext context5;
  auto hal = linuxcnc::v1::HalService::NewStub(channel);
  linuxcnc::v1::GetHalTopologyResponse topology;
  assert(hal->GetTopology(&context5, {}, &topology).ok());
  grpc::ClientContext future_topology_context;
  future_topology_context.set_deadline(
      std::chrono::system_clock::now() + std::chrono::seconds(2));
  linuxcnc::v1::WatchHalTopologyRequest future_topology_request;
  future_topology_request.set_after_sequence(topology.sequence() + 1000);
  auto future_topology = hal->WatchTopology(
      &future_topology_context, future_topology_request);
  linuxcnc::v1::WatchHalTopologyEvent future_topology_event;
  assert(future_topology->Read(&future_topology_event));
  assert(future_topology_event.sequence() < future_topology_request.after_sequence());
  future_topology_context.TryCancel();
  (void)future_topology->Finish();
  return 0;
}
