#include <google/protobuf/empty.pb.h>
#include <grpcpp/grpcpp.h>

#include <boost/asio/connect.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/websocket.hpp>
#include <cassert>
#include <chrono>
#include <iostream>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include "linuxcnc/v1/hal.grpc.pb.h"
#include "linuxcnc/v1/machine.grpc.pb.h"
#include "linuxcnc/v1/program.grpc.pb.h"
#include "linuxcnc/v1/scope.grpc.pb.h"
#include "linuxcnc/v1/websocket.pb.h"

namespace asio = boost::asio;
namespace beast = boost::beast;
namespace websocket = beast::websocket;
using tcp = asio::ip::tcp;

std::pair<std::string, std::string> split_endpoint(
    const std::string& endpoint) {
  const auto separator = endpoint.rfind(':');
  return {endpoint.substr(0, separator), endpoint.substr(separator + 1)};
}

linuxcnc::v1::PositionHistoryFrame read_telemetry_frame(
    websocket::stream<beast::tcp_stream>& socket) {
  beast::flat_buffer buffer;
  socket.read(buffer);
  std::vector<std::uint8_t> bytes(buffer.size());
  asio::buffer_copy(asio::buffer(bytes), buffer.data());
  linuxcnc::v1::PositionHistoryFrame frame;
  assert(frame.ParseFromArray(bytes.data(), static_cast<int>(bytes.size())));
  assert(frame.kind() == linuxcnc::v1::FRAME_KIND_REPLACEMENT);
  return frame;
}

std::vector<std::uint8_t> read_raw_frame(
    websocket::stream<beast::tcp_stream>& socket) {
  beast::flat_buffer buffer;
  socket.read(buffer);
  std::vector<std::uint8_t> bytes(buffer.size());
  asio::buffer_copy(asio::buffer(bytes), buffer.data());
  return bytes;
}

int main(int argc, char** argv) {
  const std::string endpoint = argc > 1 ? argv[1] : "127.0.0.1:50051";
  auto channel =
      grpc::CreateChannel(endpoint, grpc::InsecureChannelCredentials());
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
      grpc::ClientContext context;
      context.set_deadline(std::chrono::system_clock::now() +
                           std::chrono::seconds(10));
      auto stream = machine->WatchErrors(&context, {});
      linuxcnc::v1::LinuxCNCError message;
      while (stream->Read(&message)) {
      }
      terminal_ok(stream->Finish());
    });
    holders.emplace_back([&] {
      grpc::ClientContext context;
      context.set_deadline(std::chrono::system_clock::now() +
                           std::chrono::seconds(10));
      auto stream = machine->WatchStatus(&context, {});
      linuxcnc::v1::WatchStatusEvent message;
      while (stream->Read(&message)) {
      }
      terminal_ok(stream->Finish());
    });
    holders.emplace_back([&] {
      grpc::ClientContext context;
      context.set_deadline(std::chrono::system_clock::now() +
                           std::chrono::seconds(10));
      auto stream = hal->WatchTopology(&context, {});
      linuxcnc::v1::WatchHalTopologyEvent message;
      while (stream->Read(&message)) {
      }
      terminal_ok(stream->Finish());
    });
    holders.emplace_back([&] {
      grpc::ClientContext create_context;
      linuxcnc::v1::CreateWorkspaceResponse workspace;
      assert(program->CreateWorkspace(&create_context, {}, &workspace).ok());
      grpc::ClientContext context;
      context.set_deadline(std::chrono::system_clock::now() +
                           std::chrono::seconds(10));
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
      grpc::ClientContext context;
      context.set_deadline(std::chrono::system_clock::now() +
                           std::chrono::seconds(10));
      auto stream = hal->ComponentSession(&context);
      linuxcnc::v1::ComponentSessionMessage response;
      while (stream->Read(&response)) {
      }
      terminal_ok(stream->Finish());
    });
    holders.emplace_back([&] {
      grpc::ClientContext context;
      context.set_deadline(std::chrono::system_clock::now() +
                           std::chrono::seconds(10));
      auto stream = scope->Session(&context);
      linuxcnc::v1::ScopeSessionMessage acquire;
      acquire.mutable_acquire();
      assert(stream->Write(acquire));
      linuxcnc::v1::ScopeSessionMessage response;
      while (stream->Read(&response)) {
      }
      terminal_ok(stream->Finish());
    });
    for (auto& holder : holders) holder.join();
    return 0;
  }
  const std::string telemetry_endpoint = argc > 2 ? argv[2] : "127.0.0.1:50052";
  const auto [telemetry_host, telemetry_port] =
      split_endpoint(telemetry_endpoint);
  asio::io_context io;
  tcp::resolver resolver(io);
  if (argc > 3 && std::string(argv[3]) == "--hold-websocket") {
    websocket::stream<beast::tcp_stream> non_reading(io);
    beast::get_lowest_layer(non_reading)
        .connect(resolver.resolve(telemetry_host, telemetry_port));
    non_reading.handshake(telemetry_host, "/v1/position-history");
    std::cout << "websocket-held\n" << std::flush;
    // Deliberately never read the initial frame or shutdown handshake. The
    // daemon must cancel this socket rather than waiting for peer cooperation.
    std::this_thread::sleep_for(std::chrono::seconds(10));
    return 0;
  }
  websocket::stream<beast::tcp_stream> telemetry(io);
  beast::get_lowest_layer(telemetry).connect(
      resolver.resolve(telemetry_host, telemetry_port));
  telemetry.handshake(telemetry_host, "/v1/position-history");
  const auto initial_frame = read_telemetry_frame(telemetry);
  const auto initial_generation = initial_frame.generation();
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
  const auto delivery_started = std::chrono::steady_clock::now();
  assert(machine->ConfigurePositionHistory(&context2, config, &empty).ok());
  grpc::ClientContext capacity_only_context;
  linuxcnc::v1::PositionHistoryConfig capacity_only;
  capacity_only.set_capacity(64);
  assert(machine
             ->ConfigurePositionHistory(&capacity_only_context, capacity_only,
                                        &empty)
             .ok());
  const auto configured_frame = read_telemetry_frame(telemetry);
  assert(std::chrono::steady_clock::now() - delivery_started >=
         std::chrono::milliseconds(40));
  assert(configured_frame.generation() == initial_generation + 2);
  grpc::ClientContext oversized_context;
  config.set_capacity(100001);
  const auto oversized =
      machine->ConfigurePositionHistory(&oversized_context, config, &empty);
  assert(oversized.error_code() == grpc::StatusCode::RESOURCE_EXHAUSTED);
  grpc::ClientContext slow_sample_context;
  config.set_capacity(0);
  config.set_sample_period_ms(60001);
  const auto slow_sample =
      machine->ConfigurePositionHistory(&slow_sample_context, config, &empty);
  assert(slow_sample.error_code() == grpc::StatusCode::INVALID_ARGUMENT);

  grpc::ClientContext clear_context;
  assert(machine->ClearPositionHistory(&clear_context, empty, &empty).ok());
  const auto cleared_frame = read_telemetry_frame(telemetry);
  assert(cleared_frame.generation() != configured_frame.generation());
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

  grpc::ClientContext create_signal_context;
  linuxcnc::v1::CreateHalSignalRequest create_signal;
  create_signal.set_name("integration.telemetry");
  create_signal.set_type(linuxcnc::v1::HAL_TYPE_BIT);
  linuxcnc::v1::CreateHalSignalResponse created_signal;
  assert(
      hal->CreateSignal(&create_signal_context, create_signal, &created_signal)
          .ok());
  grpc::ClientContext create_subscription_context;
  linuxcnc::v1::CreateHalValueSubscriptionRequest create_subscription;
  create_subscription.set_sample_period_ms(50);
  auto* requested_item = create_subscription.add_items();
  requested_item->set_kind(linuxcnc::v1::HAL_ITEM_KIND_SIGNAL);
  requested_item->set_name("integration.telemetry");
  linuxcnc::v1::HalValueSubscription value_subscription;
  assert(hal->CreateValueSubscription(&create_subscription_context,
                                      create_subscription, &value_subscription)
             .ok());
  assert(value_subscription.revision() == 1);
  assert(value_subscription.slots_size() == 1);
  websocket::stream<beast::tcp_stream> hal_telemetry(io);
  beast::get_lowest_layer(hal_telemetry)
      .connect(resolver.resolve(telemetry_host, telemetry_port));
  hal_telemetry.handshake(telemetry_host, value_subscription.websocket_path());
  const auto hal_replacement_bytes = read_raw_frame(hal_telemetry);
  linuxcnc::v1::HalValueFrame hal_replacement;
  assert(hal_replacement.ParseFromArray(
      hal_replacement_bytes.data(),
      static_cast<int>(hal_replacement_bytes.size())));
  assert(hal_replacement.kind() == linuxcnc::v1::FRAME_KIND_REPLACEMENT);
  assert(hal_replacement.revision() == 1);
  assert(hal_replacement.entries_size() == 1);
  grpc::ClientContext write_context;
  linuxcnc::v1::HalWrite write;
  auto* write_value = write.add_writes();
  *write_value->mutable_item() = *requested_item;
  write_value->mutable_value()->set_type(linuxcnc::v1::HAL_TYPE_BIT);
  write_value->mutable_value()->set_bit(true);
  linuxcnc::v1::HalWriteResponse write_response;
  assert(hal->Write(&write_context, write, &write_response).ok());

  linuxcnc::v1::HalReadRequest duplicate_read;
  *duplicate_read.add_items() = *requested_item;
  *duplicate_read.add_items() = *requested_item;
  linuxcnc::v1::HalReadResponse rejected_read;
  grpc::ClientContext duplicate_read_context;
  assert(hal->Read(&duplicate_read_context, duplicate_read, &rejected_read)
             .error_code() == grpc::StatusCode::INVALID_ARGUMENT);

  linuxcnc::v1::HalWrite duplicate_write;
  *duplicate_write.add_writes() = *write_value;
  *duplicate_write.add_writes() = *write_value;
  grpc::ClientContext duplicate_write_context;
  linuxcnc::v1::HalWriteResponse rejected_write;
  assert(hal->Write(&duplicate_write_context, duplicate_write, &rejected_write)
             .error_code() == grpc::StatusCode::INVALID_ARGUMENT);

  linuxcnc::v1::HalReadRequest oversized_read;
  for (int index = 0; index < 1025; ++index) {
    auto* oversized_item = oversized_read.add_items();
    oversized_item->set_kind(linuxcnc::v1::HAL_ITEM_KIND_SIGNAL);
    oversized_item->set_name("integration.item." + std::to_string(index));
  }
  grpc::ClientContext oversized_read_context;
  assert(hal->Read(&oversized_read_context, oversized_read, &rejected_read)
             .error_code() == grpc::StatusCode::RESOURCE_EXHAUSTED);

  linuxcnc::v1::HalWrite oversized_write;
  for (int index = 0; index < 1025; ++index) {
    auto* oversized_value = oversized_write.add_writes();
    oversized_value->mutable_item()->set_kind(
        linuxcnc::v1::HAL_ITEM_KIND_SIGNAL);
    oversized_value->mutable_item()->set_name("integration.item." +
                                              std::to_string(index));
    oversized_value->mutable_value()->set_type(linuxcnc::v1::HAL_TYPE_BIT);
    oversized_value->mutable_value()->set_bit(false);
  }
  grpc::ClientContext oversized_write_context;
  assert(hal->Write(&oversized_write_context, oversized_write, &rejected_write)
             .error_code() == grpc::StatusCode::RESOURCE_EXHAUSTED);

  const auto hal_delta_bytes = read_raw_frame(hal_telemetry);
  linuxcnc::v1::HalValueFrame hal_delta;
  assert(hal_delta.ParseFromArray(hal_delta_bytes.data(),
                                  static_cast<int>(hal_delta_bytes.size())));
  assert(hal_delta.kind() == linuxcnc::v1::FRAME_KIND_DELTA);
  assert(hal_delta.entries_size() == 1);
  assert(hal_delta.entries(0).value().bit());
  grpc::ClientContext update_subscription_context;
  linuxcnc::v1::UpdateHalValueSubscriptionRequest update_subscription;
  update_subscription.set_subscription_id(value_subscription.subscription_id());
  update_subscription.set_expected_revision(value_subscription.revision());
  update_subscription.set_sample_period_ms(100);
  linuxcnc::v1::HalValueSubscription updated_subscription;
  assert(hal->UpdateValueSubscription(&update_subscription_context,
                                      update_subscription,
                                      &updated_subscription)
             .ok());
  assert(updated_subscription.revision() == 2);
  const auto empty_replacement_bytes = read_raw_frame(hal_telemetry);
  linuxcnc::v1::HalValueFrame empty_replacement;
  assert(empty_replacement.ParseFromArray(
      empty_replacement_bytes.data(),
      static_cast<int>(empty_replacement_bytes.size())));
  assert(empty_replacement.kind() == linuxcnc::v1::FRAME_KIND_REPLACEMENT);
  assert(empty_replacement.revision() == 2);
  assert(empty_replacement.entries_size() == 0);
  grpc::ClientContext future_topology_context;
  future_topology_context.set_deadline(std::chrono::system_clock::now() +
                                       std::chrono::seconds(2));
  linuxcnc::v1::WatchHalTopologyRequest future_topology_request;
  future_topology_request.set_after_sequence(topology.sequence() + 1000);
  auto future_topology =
      hal->WatchTopology(&future_topology_context, future_topology_request);
  linuxcnc::v1::WatchHalTopologyEvent future_topology_event;
  assert(future_topology->Read(&future_topology_event));
  assert(future_topology_event.sequence() <
         future_topology_request.after_sequence());
  future_topology_context.TryCancel();
  (void)future_topology->Finish();

  grpc::ClientContext component_context;
  component_context.set_deadline(std::chrono::system_clock::now() +
                                 std::chrono::seconds(2));
  auto component = hal->ComponentSession(&component_context);
  linuxcnc::v1::ComponentSessionMessage component_request;
  component_request.mutable_open()->set_name("integration-component");
  assert(component->Write(component_request));
  linuxcnc::v1::ComponentSessionMessage component_response;
  assert(component->Read(&component_response));
  assert(component_response.has_metadata());

  component_request.Clear();
  component_request.mutable_pin()->set_name("output");
  component_request.mutable_pin()->set_type(linuxcnc::v1::HAL_TYPE_S32);
  component_request.mutable_pin()->set_direction(
      linuxcnc::v1::HAL_PIN_DIRECTION_OUT);
  assert(component->Write(component_request));

  component_request.Clear();
  component_request.mutable_value()->mutable_item()->set_kind(
      linuxcnc::v1::HAL_ITEM_KIND_PIN);
  component_request.mutable_value()->mutable_item()->set_name(
      "integration-component.output");
  component_request.mutable_value()->mutable_value()->set_type(
      linuxcnc::v1::HAL_TYPE_S32);
  component_request.mutable_value()->mutable_value()->set_s32(42);
  assert(component->Write(component_request));
  assert(component->Read(&component_response));
  assert(component_response.has_value());
  assert(component_response.value().item().name() ==
         "integration-component.output");
  assert(component_response.value().value().s32() == 42);

  component_request.Clear();
  component_request.mutable_close();
  assert(component->Write(component_request));
  component->WritesDone();
  assert(component->Finish().ok());
  return 0;
}
