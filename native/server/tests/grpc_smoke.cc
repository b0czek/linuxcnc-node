#include "linuxcnc/v1/linuxcnc.grpc.pb.h"

#include <grpcpp/grpcpp.h>
#include <google/protobuf/empty.pb.h>

#include <cassert>
#include <memory>
#include <string>
#include <chrono>
#include <thread>
#include <vector>

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
      auto stream = machine->WatchPositionHistory(&context, {});
      linuxcnc::v1::PositionHistoryEvent message;
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
  grpc::ClientContext context;
  linuxcnc::v1::GetStatusResponse status;
  const auto status_result = machine->GetStatus(&context, {}, &status);
  // The smoke daemon has no LinuxCNC NML instance. It must expose an
  // explicit unavailable status rather than fabricate an empty snapshot.
  assert(status_result.error_code() == grpc::StatusCode::UNAVAILABLE);

  grpc::ClientContext context2;
  linuxcnc::v1::PositionHistoryConfig config;
  config.set_enabled(true);
  config.set_capacity(32);
  google::protobuf::Empty empty;
  assert(machine->ConfigurePositionHistory(&context2, config, &empty).ok());
  grpc::ClientContext oversized_context;
  config.set_capacity(100001);
  const auto oversized = machine->ConfigurePositionHistory(
      &oversized_context, config, &empty);
  assert(oversized.error_code() == grpc::StatusCode::RESOURCE_EXHAUSTED);

  grpc::ClientContext context3;
  linuxcnc::v1::PositionHistoryRequest request;
  auto* cursor = request.mutable_cursor();
  cursor->set_after_sequence(0);
  linuxcnc::v1::PositionHistorySnapshot snapshot;
  assert(machine->GetPositionHistory(&context3, request, &snapshot).ok());
  assert(snapshot.stride() == 10);

  auto program = linuxcnc::v1::ProgramService::NewStub(channel);
  grpc::ClientContext context4;
  linuxcnc::v1::CreateWorkspaceResponse workspace;
  assert(program->CreateWorkspace(&context4, {}, &workspace).ok());
  assert(!workspace.workspace_id().empty());

  grpc::ClientContext context5;
  auto hal = linuxcnc::v1::HalService::NewStub(channel);
  linuxcnc::v1::GetHalTopologyResponse topology;
  assert(hal->GetTopology(&context5, {}, &topology).ok());
  return 0;
}
