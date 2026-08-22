#include "linuxcnc/v1/linuxcnc.grpc.pb.h"

#include <grpcpp/grpcpp.h>

#include <cassert>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <functional>
#include <iostream>
#include <iterator>
#include <limits>
#include <memory>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {

using linuxcnc::v1::ExecuteCommandRequest;
using linuxcnc::v1::ExecuteCommandResponse;
using linuxcnc::v1::GetStatusResponse;

std::shared_ptr<grpc::Channel> make_channel(const std::string& endpoint) {
  return grpc::CreateChannel(endpoint, grpc::InsecureChannelCredentials());
}

GetStatusResponse get_status_with_retry(
    linuxcnc::v1::MachineService::Stub* machine) {
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(15);
  while (std::chrono::steady_clock::now() < deadline) {
    grpc::ClientContext context;
    context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(2));
    GetStatusResponse response;
    const auto status = machine->GetStatus(&context, {}, &response);
    if (status.ok()) return response;
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
  std::cerr << "LinuxCNC status did not become available within 15 seconds\n";
  std::abort();
}

ExecuteCommandResponse set_optional_stop(
    linuxcnc::v1::MachineService::Stub* machine,
    bool enabled, linuxcnc::v1::WaitPolicy wait_policy) {
  ExecuteCommandRequest request;
  request.set_wait_policy(wait_policy);
  request.mutable_set_optional_stop()->set_enable(enabled);
  grpc::ClientContext context;
  context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(5));
  ExecuteCommandResponse response;
  const auto status = machine->ExecuteCommand(&context, request, &response);
  if (!status.ok()) {
    std::cerr << "ExecuteCommand failed: " << status.error_message() << "\n";
    std::abort();
  }
  assert(response.command_sequence() != 0);
  return response;
}

ExecuteCommandResponse execute_completed(
    linuxcnc::v1::MachineService::Stub* machine,
    ExecuteCommandRequest request) {
  request.set_wait_policy(linuxcnc::v1::WAIT_POLICY_COMPLETED);
  grpc::ClientContext context;
  context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(10));
  ExecuteCommandResponse response;
  const auto status = machine->ExecuteCommand(&context, request, &response);
  if (!status.ok()) {
    std::cerr << "ExecuteCommand failed: " << status.error_message() << "\n";
    std::abort();
  }
  assert(response.status() == linuxcnc::v1::RCS_STATUS_DONE);
  return response;
}

void expect_command_error(linuxcnc::v1::MachineService::Stub* machine,
                          ExecuteCommandRequest request,
                          grpc::StatusCode expected) {
  grpc::ClientContext context;
  context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(2));
  ExecuteCommandResponse response;
  const auto status = machine->ExecuteCommand(&context, request, &response);
  assert(!status.ok());
  assert(status.error_code() == expected);
}

std::string read_file(const std::string& path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    std::cerr << "Unable to read native G-code fixture: " << path << "\n";
    std::abort();
  }
  return {std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
}

void require_shutdown_status(const grpc::Status& status, const char* name) {
  if (status.error_code() != grpc::StatusCode::UNAVAILABLE &&
      status.error_code() != grpc::StatusCode::CANCELLED) {
    std::cerr << name << " ended with unexpected status "
              << status.error_code() << ": " << status.error_message() << "\n";
    std::abort();
  }
}

std::string make_large_gcode() {
  std::string result{"G21 G90\n"};
  result.reserve(2U * 1024U * 1024U);
  for (int index = 0; index < 75000; ++index) {
    result += "G1 X" + std::to_string(index % 100) + " Y" +
              std::to_string((index * 7) % 100) + " F100\n";
  }
  result += "M2\n";
  return result;
}

linuxcnc::v1::CreateWorkspaceResponse upload_program(
    linuxcnc::v1::ProgramService::Stub* program, const std::string& path,
    const std::string& contents) {
  grpc::ClientContext create_context;
  linuxcnc::v1::CreateWorkspaceResponse workspace;
  assert(program->CreateWorkspace(&create_context, {}, &workspace).ok());
  grpc::ClientContext upload_context;
  linuxcnc::v1::UploadWorkspaceResponse response;
  auto upload = program->UploadWorkspace(&upload_context, &response);
  linuxcnc::v1::UploadWorkspaceRequest file;
  file.set_workspace_id(workspace.workspace_id());
  file.mutable_file()->set_relative_path(path);
  file.mutable_file()->set_data(contents);
  file.mutable_file()->set_eof(true);
  assert(upload->Write(file));
  linuxcnc::v1::UploadWorkspaceRequest finish;
  finish.set_workspace_id(workspace.workspace_id());
  finish.set_finish(true);
  assert(upload->Write(finish));
  assert(upload->WritesDone());
  assert(upload->Finish().ok());
  return workspace;
}

int probe_reacquire(const std::string& endpoint) {
  const auto channel = make_channel(endpoint);
  auto hal = linuxcnc::v1::HalService::NewStub(channel);
  auto scope = linuxcnc::v1::ScopeService::NewStub(channel);
  (void)get_status_with_retry(linuxcnc::v1::MachineService::NewStub(channel).get());

  grpc::ClientContext component_context;
  component_context.set_deadline(std::chrono::system_clock::now() +
                                 std::chrono::seconds(5));
  auto component = hal->ComponentSession(&component_context);
  linuxcnc::v1::ComponentSessionMessage request;
  request.mutable_open()->set_name("grpc-shutdown-owned");
  request.mutable_open()->set_prefix("grpc-shutdown-owned");
  assert(component->Write(request));
  linuxcnc::v1::ComponentSessionMessage response;
  assert(component->Read(&response) && response.has_metadata());
  request.Clear();
  request.mutable_pin()->set_name("value");
  request.mutable_pin()->set_type(linuxcnc::v1::HAL_TYPE_FLOAT);
  request.mutable_pin()->set_direction(linuxcnc::v1::HAL_PIN_DIRECTION_OUT);
  assert(component->Write(request));
  request.Clear();
  request.mutable_ready()->set_ready(true);
  assert(component->Write(request));
  do { assert(component->Read(&response)); } while (!response.has_metadata());
  assert(response.metadata().ready());

  grpc::ClientContext scope_context;
  scope_context.set_deadline(std::chrono::system_clock::now() +
                             std::chrono::seconds(5));
  auto session = scope->Session(&scope_context);
  linuxcnc::v1::ScopeSessionMessage acquire;
  acquire.mutable_acquire();
  assert(session->Write(acquire));
  linuxcnc::v1::ScopeSessionMessage scope_response;
  assert(session->Read(&scope_response) && scope_response.has_status());

  acquire.Clear(); acquire.mutable_stop();
  assert(session->Write(acquire));
  do { assert(session->Read(&scope_response)); } while (!scope_response.has_status());
  session->WritesDone();
  while (session->Read(&scope_response)) {}
  assert(session->Finish().ok());
  request.Clear(); request.mutable_close();
  assert(component->Write(request));
  component->WritesDone();
  assert(component->Finish().ok());
  std::cout << "LIVE_REACQUIRE_READY" << std::endl;
  return 0;
}

int hold_shutdown(const std::string& endpoint) {
  const auto channel = make_channel(endpoint);
  auto machine = linuxcnc::v1::MachineService::NewStub(channel);
  auto program = linuxcnc::v1::ProgramService::NewStub(channel);
  auto hal = linuxcnc::v1::HalService::NewStub(channel);
  auto scope = linuxcnc::v1::ScopeService::NewStub(channel);
  (void)get_status_with_retry(machine.get());

  grpc::ClientContext error_context;
  error_context.set_deadline(std::chrono::system_clock::now() +
                             std::chrono::seconds(15));
  auto errors = machine->WatchErrors(&error_context, {});

  const auto large_workspace = upload_program(
      program.get(), "shutdown-large.ngc", make_large_gcode());
  std::vector<std::unique_ptr<grpc::ClientContext>> parse_contexts;
  std::vector<std::unique_ptr<grpc::ClientReader<linuxcnc::v1::ParseProgramEvent>>> parses;
  for (int index = 0; index < 6; ++index) {
    auto context = std::make_unique<grpc::ClientContext>();
    context->set_deadline(std::chrono::system_clock::now() +
                          std::chrono::seconds(15));
    linuxcnc::v1::ParseProgramRequest request;
    request.mutable_entry()->set_workspace_id(large_workspace.workspace_id());
    request.mutable_entry()->set_relative_path("shutdown-large.ngc");
    parses.push_back(program->ParseProgram(context.get(), request));
    parse_contexts.push_back(std::move(context));
  }

  grpc::ClientContext partial_create_context;
  linuxcnc::v1::CreateWorkspaceResponse partial_workspace;
  assert(program->CreateWorkspace(
      &partial_create_context, {}, &partial_workspace).ok());
  grpc::ClientContext upload_context;
  upload_context.set_deadline(std::chrono::system_clock::now() +
                              std::chrono::seconds(15));
  linuxcnc::v1::UploadWorkspaceResponse upload_response;
  auto upload = program->UploadWorkspace(&upload_context, &upload_response);
  linuxcnc::v1::UploadWorkspaceRequest upload_request;
  upload_request.set_workspace_id(partial_workspace.workspace_id());
  upload_request.mutable_file()->set_relative_path("partial.ngc");
  upload_request.mutable_file()->set_data("G1 X1\n");
  assert(upload->Write(upload_request));

  grpc::ClientContext component_context;
  component_context.set_deadline(std::chrono::system_clock::now() +
                                 std::chrono::seconds(15));
  auto component = hal->ComponentSession(&component_context);
  linuxcnc::v1::ComponentSessionMessage component_request;
  component_request.mutable_open()->set_name("grpc-shutdown-owned");
  component_request.mutable_open()->set_prefix("grpc-shutdown-owned");
  assert(component->Write(component_request));
  linuxcnc::v1::ComponentSessionMessage component_response;
  assert(component->Read(&component_response) && component_response.has_metadata());
  component_request.Clear();
  component_request.mutable_pin()->set_name("value");
  component_request.mutable_pin()->set_type(linuxcnc::v1::HAL_TYPE_FLOAT);
  component_request.mutable_pin()->set_direction(
      linuxcnc::v1::HAL_PIN_DIRECTION_OUT);
  assert(component->Write(component_request));
  component_request.Clear(); component_request.mutable_ready()->set_ready(true);
  assert(component->Write(component_request));
  do { assert(component->Read(&component_response)); }
  while (!component_response.has_metadata());
  assert(component_response.metadata().ready());

  // Start after the owned component is fully visible so the held watch has no
  // pending mutation to encode before the daemon-shutdown race begins.
  grpc::ClientContext topology_snapshot_context;
  linuxcnc::v1::GetHalTopologyResponse topology_snapshot;
  assert(hal->GetTopology(&topology_snapshot_context, {}, &topology_snapshot).ok());
  grpc::ClientContext topology_context;
  topology_context.set_deadline(std::chrono::system_clock::now() +
                                std::chrono::seconds(15));
  linuxcnc::v1::WatchHalTopologyRequest topology_request;
  topology_request.set_after_sequence(topology_snapshot.sequence());
  auto topology = hal->WatchTopology(&topology_context, topology_request);

  grpc::ClientContext scope_context;
  scope_context.set_deadline(std::chrono::system_clock::now() +
                             std::chrono::seconds(15));
  auto session = scope->Session(&scope_context);
  linuxcnc::v1::ScopeSessionMessage scope_request;
  scope_request.mutable_acquire();
  assert(session->Write(scope_request));
  linuxcnc::v1::ScopeSessionMessage scope_response;
  assert(session->Read(&scope_response) && scope_response.has_status());

  std::cout << "LIVE_SHUTDOWN_READY" << std::endl;

  linuxcnc::v1::LinuxCNCError error;
  while (errors->Read(&error)) {}
  require_shutdown_status(errors->Finish(), "WatchErrors");
  linuxcnc::v1::WatchHalTopologyEvent topology_event;
  while (topology->Read(&topology_event)) {}
  require_shutdown_status(topology->Finish(), "WatchTopology");
  upload->WritesDone();
  require_shutdown_status(upload->Finish(), "UploadWorkspace");
  for (auto& parse : parses) {
    linuxcnc::v1::ParseProgramEvent event;
    while (parse->Read(&event)) {}
    require_shutdown_status(parse->Finish(), "ParseProgram");
  }
  component->WritesDone();
  while (component->Read(&component_response)) {}
  require_shutdown_status(component->Finish(), "ComponentSession");
  session->WritesDone();
  while (session->Read(&scope_response)) {}
  require_shutdown_status(session->Finish(), "ScopeSession");
  std::cout << "LIVE_SHUTDOWN_TERMINATED" << std::endl;
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 3) {
    std::cerr << "usage: linuxcnc-grpc-live-smoke ENDPOINT GCODE_FIXTURE\n";
    return 2;
  }
  const std::string endpoint = argc > 1 ? argv[1] : "127.0.0.1:50051";
  const std::string mode = argc > 3 ? argv[3] : "";
  if (mode == "--hold-shutdown") return hold_shutdown(endpoint);
  if (mode == "--probe-reacquire") return probe_reacquire(endpoint);
  if (!mode.empty()) {
    std::cerr << "unknown mode: " << mode << "\n";
    return 2;
  }
  const std::string gcode = read_file(argv[2]);
  const auto channel = make_channel(endpoint);
  const auto machine = linuxcnc::v1::MachineService::NewStub(channel);

  const auto baseline = get_status_with_retry(machine.get());
  assert(baseline.sequence() != 0);
  assert(baseline.has_status());
  assert(baseline.status().has_task());
  assert(baseline.status().has_motion());

  const auto target_optional_stop = !baseline.status().task().optional_stop_state();
  const auto accepted = set_optional_stop(
      machine.get(), target_optional_stop, linuxcnc::v1::WAIT_POLICY_ACCEPTED);
  assert(accepted.status() == linuxcnc::v1::RCS_STATUS_EXEC ||
         accepted.status() == linuxcnc::v1::RCS_STATUS_DONE);
  const auto completed = set_optional_stop(
      machine.get(), target_optional_stop, linuxcnc::v1::WAIT_POLICY_COMPLETED);
  assert(completed.status() == linuxcnc::v1::RCS_STATUS_DONE);
  const auto changed = get_status_with_retry(machine.get());
  assert(changed.status().task().optional_stop_state() == target_optional_stop);

  // The first event is a typed replay from the baseline sequence. This
  // verifies that a status change made through the command queue is visible
  // without requiring a second full snapshot.
  grpc::ClientContext watch_context;
  watch_context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(5));
  linuxcnc::v1::WatchStatusRequest watch_request;
  watch_request.set_after_sequence(baseline.sequence());
  auto watch = machine->WatchStatus(&watch_context, watch_request);
  linuxcnc::v1::WatchStatusEvent event;
  assert(watch->Read(&event));
  assert(event.has_replay());
  assert(event.replay().from_sequence() == baseline.sequence());
  assert(event.replay().deltas_size() > 0);
  bool found_optional_stop_delta = false;
  for (const auto& delta : event.replay().deltas()) {
    if (delta.has_task() && delta.task().has_optional_stop_state()) {
      found_optional_stop_delta = true;
      break;
    }
  }
  assert(found_optional_stop_delta);
  watch_context.TryCancel();
  (void)watch->Finish();

  // Position history configuration remains on the gRPC control plane.
  linuxcnc::v1::PositionHistoryConfig position_config;
  position_config.set_enabled(true);
  position_config.set_capacity(64);
  position_config.set_sample_period_ms(10);
  google::protobuf::Empty empty;
  grpc::ClientContext configure_position_context;
  const auto configure_position_status = machine->ConfigurePositionHistory(
      &configure_position_context, position_config, &empty);
  assert(configure_position_status.ok());

  ExecuteCommandRequest reset_estop;
  reset_estop.mutable_set_state()->set_state(linuxcnc::v1::TASK_STATE_ESTOP_RESET);
  (void)execute_completed(machine.get(), std::move(reset_estop));
  ExecuteCommandRequest machine_on;
  machine_on.mutable_set_state()->set_state(linuxcnc::v1::TASK_STATE_ON);
  (void)execute_completed(machine.get(), std::move(machine_on));
  ExecuteCommandRequest mdi_mode;
  mdi_mode.mutable_set_task_mode()->set_mode(linuxcnc::v1::TASK_MODE_MDI);
  (void)execute_completed(machine.get(), std::move(mdi_mode));
  ExecuteCommandRequest mdi_move;
  mdi_move.mutable_mdi()->set_command("G0 X1");
  (void)execute_completed(machine.get(), std::move(mdi_move));

  // Exercise one safe representative from the remaining command families.
  // The protobuf setters are the command catalog: this table deliberately
  // does not duplicate command-case numbers or names.
  const std::pair<const char*, std::function<void(ExecuteCommandRequest&)>> commands[] = {
      {"task", [](auto& request) { request.mutable_task_plan_synch(); }},
      {"trajectory", [](auto& request) { request.mutable_set_feed_rate()->set_value(1.0); }},
      {"jog", [](auto& request) {
         request.mutable_jog_stop()->set_axis_or_joint_index(0);
         request.mutable_jog_stop()->set_is_joint_jog(false);
       }},
      {"spindle", [](auto& request) { request.mutable_spindle_off()->set_spindle_index(0); }},
      {"coolant", [](auto& request) { request.mutable_set_mist()->set_enable(false); }},
      {"tool", [](auto& request) { request.mutable_load_tool_table(); }},
      {"io", [](auto& request) {
         request.mutable_set_digital_output()->set_index(0);
         request.mutable_set_digital_output()->set_value(false);
       }},
      {"debug", [](auto& request) { request.mutable_set_debug_level()->set_level(0); }},
      {"operator-message", [](auto& request) {
         request.mutable_send_operator_text()->set_message("linuxcnc-grpc live acceptance");
       }},
  };
  for (const auto& [family, prepare] : commands) {
    ExecuteCommandRequest request;
    prepare(request);
    const auto response = execute_completed(machine.get(), std::move(request));
    if (response.command_sequence() == 0) {
      std::cerr << "missing command sequence for " << family << " family\n";
      return 1;
    }
  }
  expect_command_error(machine.get(), ExecuteCommandRequest{},
                       grpc::StatusCode::INVALID_ARGUMENT);

  grpc::ClientContext clear_position_context;
  const auto clear_position_status = machine->ClearPositionHistory(
      &clear_position_context, empty, &empty);
  assert(clear_position_status.ok());

  // Upload and parse a repo-owned native fixture through the real workspace
  // store and the serialized rs274 interpreter.
  const auto program = linuxcnc::v1::ProgramService::NewStub(channel);
  linuxcnc::v1::CreateWorkspaceRequest create_workspace_request;
  create_workspace_request.set_ttl_seconds(60);
  linuxcnc::v1::CreateWorkspaceResponse workspace;
  grpc::ClientContext create_workspace_context;
  const auto create_workspace_status = program->CreateWorkspace(
      &create_workspace_context, create_workspace_request, &workspace);
  assert(create_workspace_status.ok());
  assert(!workspace.workspace_id().empty());

  linuxcnc::v1::UploadWorkspaceResponse upload_response;
  grpc::ClientContext upload_context;
  auto upload = program->UploadWorkspace(&upload_context, &upload_response);
  linuxcnc::v1::UploadWorkspaceRequest upload_file;
  upload_file.set_workspace_id(workspace.workspace_id());
  upload_file.mutable_file()->set_relative_path("simple-linear.ngc");
  upload_file.mutable_file()->set_data(gcode);
  upload_file.mutable_file()->set_eof(true);
  assert(upload->Write(upload_file));
  linuxcnc::v1::UploadWorkspaceRequest upload_finish;
  upload_finish.set_workspace_id(workspace.workspace_id());
  upload_finish.set_finish(true);
  assert(upload->Write(upload_finish));
  assert(upload->WritesDone());
  const auto upload_status = upload->Finish();
  assert(upload_status.ok());
  assert(upload_response.bytes_written() == gcode.size());
  assert(upload_response.files_size() == 1);

  linuxcnc::v1::ParseProgramRequest parse_request;
  parse_request.mutable_entry()->set_workspace_id(workspace.workspace_id());
  parse_request.mutable_entry()->set_relative_path("simple-linear.ngc");
  grpc::ClientContext parse_context;
  parse_context.set_deadline(
      std::chrono::system_clock::now() + std::chrono::seconds(15));
  auto parse = program->ParseProgram(&parse_context, parse_request);
  linuxcnc::v1::ParseProgramEvent parse_event;
  std::uint64_t parsed_operations = 0;
  bool saw_parse_summary = false;
  while (parse->Read(&parse_event)) {
    if (parse_event.has_batch()) {
      parsed_operations += static_cast<std::uint64_t>(
          parse_event.batch().operations_size());
    } else if (parse_event.has_summary()) {
      saw_parse_summary = true;
      assert(parse_event.summary().operation_count() == parsed_operations);
      assert(parse_event.summary().has_extents());
    } else if (parse_event.has_error()) {
      std::cerr << "ParseProgram error: " << parse_event.error().message() << "\n";
      return 1;
    }
  }
  const auto parse_status = parse->Finish();
  assert(parse_status.ok());
  assert(parsed_operations > 0);
  assert(saw_parse_summary);

  linuxcnc::v1::DeleteWorkspaceRequest delete_workspace_request;
  delete_workspace_request.set_workspace_id(workspace.workspace_id());
  grpc::ClientContext delete_workspace_context;
  const auto delete_workspace_status = program->DeleteWorkspace(
      &delete_workspace_context, delete_workspace_request, &empty);
  assert(delete_workspace_status.ok());

  auto hal = linuxcnc::v1::HalService::NewStub(channel);
  grpc::ClientContext topology_context;
  linuxcnc::v1::GetHalTopologyResponse topology;
  const auto topology_status = hal->GetTopology(&topology_context, {}, &topology);
  if (!topology_status.ok()) {
    std::cerr << "HAL topology failed: " << topology_status.error_message() << "\n";
    return 1;
  }
  assert(topology.sequence() != 0);
  assert(topology.has_topology());
  assert(topology.topology().pins_size() > 0);

  // A real HAL mutation must advance the typed topology stream.
  grpc::ClientContext topology_watch_context;
  topology_watch_context.set_deadline(
      std::chrono::system_clock::now() + std::chrono::seconds(5));
  linuxcnc::v1::WatchHalTopologyRequest topology_watch_request;
  topology_watch_request.set_after_sequence(topology.sequence());
  auto topology_watch = hal->WatchTopology(
      &topology_watch_context, topology_watch_request);
  linuxcnc::v1::CreateHalSignalRequest watched_signal_request;
  watched_signal_request.set_name("grpc-live-topology-watch");
  watched_signal_request.set_type(linuxcnc::v1::HAL_TYPE_FLOAT);
  linuxcnc::v1::CreateHalSignalResponse watched_signal_response;
  grpc::ClientContext watched_signal_context;
  assert(hal->CreateSignal(&watched_signal_context, watched_signal_request,
                           &watched_signal_response).ok());
  linuxcnc::v1::WatchHalTopologyEvent topology_event;
  bool saw_watched_signal = false;
  while (topology_watch->Read(&topology_event)) {
    if (topology_event.sequence() <= topology.sequence()) continue;
    for (const auto& signal : topology_event.topology().signals()) {
      if (signal.name() == watched_signal_request.name()) {
        saw_watched_signal = true;
        break;
      }
    }
    if (saw_watched_signal) break;
  }
  topology_watch_context.TryCancel();
  (void)topology_watch->Finish();
  assert(saw_watched_signal);

  linuxcnc::v1::GetHalWriterMetadataResponse writer_metadata;
  grpc::ClientContext writer_metadata_context;
  assert(hal->GetWriterMetadata(&writer_metadata_context, {}, &writer_metadata).ok());
  assert(writer_metadata.metadata().writer_id() == "linuxcnc-grpc-server");
  assert(writer_metadata.metadata().ready());
  linuxcnc::v1::SetHalWriterReadyRequest writer_ready;
  writer_ready.set_ready(false);
  grpc::ClientContext writer_ready_context;
  assert(hal->SetWriterReady(&writer_ready_context, writer_ready, &empty).ok());
  linuxcnc::v1::GetHalWriterMetadataResponse unready_metadata;
  grpc::ClientContext unready_metadata_context;
  assert(hal->GetWriterMetadata(&unready_metadata_context, {}, &unready_metadata).ok());
  assert(!unready_metadata.metadata().ready());
  writer_ready.set_ready(true);
  grpc::ClientContext restore_writer_ready_context;
  assert(hal->SetWriterReady(
      &restore_writer_ready_context, writer_ready, &empty).ok());
  linuxcnc::v1::GetHalWriterMetadataResponse restored_metadata;
  grpc::ClientContext restored_metadata_context;
  assert(hal->GetWriterMetadata(
      &restored_metadata_context, {}, &restored_metadata).ok());
  assert(restored_metadata.metadata().ready());

  const auto& pin = topology.topology().pins(0);
  linuxcnc::v1::HalReadRequest read_request;
  auto* item = read_request.add_items();
  item->set_kind(linuxcnc::v1::HAL_ITEM_KIND_PIN);
  item->set_name(pin.name());
  grpc::ClientContext read_context;
  linuxcnc::v1::HalReadResponse read_response;
  const auto read_status = hal->Read(&read_context, read_request, &read_response);
  if (!read_status.ok()) {
    std::cerr << "HAL read failed for " << pin.name() << ": "
              << read_status.error_message() << "\n";
    return 1;
  }
  assert(read_response.values_size() == 1);
  assert(read_response.values(0).value().type() != linuxcnc::v1::HAL_TYPE_UNSPECIFIED);

  // Prove that both 64-bit HAL integer types survive the real HAL and
  // protobuf boundaries without a JavaScript-number-style precision loss.
  const std::int64_t signed_value = -9007199254740993LL;
  const std::uint64_t unsigned_value = 18446744073709551600ULL;
  for (const auto& [name, type] : {
           std::pair{"grpc-live-s64", linuxcnc::v1::HAL_TYPE_S64},
           std::pair{"grpc-live-u64", linuxcnc::v1::HAL_TYPE_U64}}) {
    linuxcnc::v1::CreateHalSignalRequest create_signal_request;
    create_signal_request.set_name(name);
    create_signal_request.set_type(type);
    linuxcnc::v1::CreateHalSignalResponse create_signal_response;
    grpc::ClientContext create_signal_context;
    const auto create_signal_status = hal->CreateSignal(
        &create_signal_context, create_signal_request, &create_signal_response);
    assert(create_signal_status.ok());
    assert(create_signal_response.signal().name() == name);
    assert(create_signal_response.signal().type() == type);
  }

  linuxcnc::v1::CreateHalSignalRequest conflicting_signal;
  conflicting_signal.set_name("grpc-live-s64");
  conflicting_signal.set_type(linuxcnc::v1::HAL_TYPE_U64);
  linuxcnc::v1::CreateHalSignalResponse conflicting_signal_response;
  grpc::ClientContext conflicting_signal_context;
  const auto conflicting_signal_status = hal->CreateSignal(
      &conflicting_signal_context, conflicting_signal, &conflicting_signal_response);
  assert(conflicting_signal_status.error_code() == grpc::StatusCode::INVALID_ARGUMENT);

  linuxcnc::v1::HalWrite exact_write;
  auto* signed_write = exact_write.add_writes();
  signed_write->mutable_item()->set_kind(linuxcnc::v1::HAL_ITEM_KIND_SIGNAL);
  signed_write->mutable_item()->set_name("grpc-live-s64");
  signed_write->mutable_value()->set_type(linuxcnc::v1::HAL_TYPE_S64);
  signed_write->mutable_value()->set_s64(signed_value);
  auto* unsigned_write = exact_write.add_writes();
  unsigned_write->mutable_item()->set_kind(linuxcnc::v1::HAL_ITEM_KIND_SIGNAL);
  unsigned_write->mutable_item()->set_name("grpc-live-u64");
  unsigned_write->mutable_value()->set_type(linuxcnc::v1::HAL_TYPE_U64);
  unsigned_write->mutable_value()->set_u64(unsigned_value);
  linuxcnc::v1::HalWriteResponse exact_write_response;
  grpc::ClientContext exact_write_context;
  const auto exact_write_status = hal->Write(
      &exact_write_context, exact_write, &exact_write_response);
  assert(exact_write_status.ok());
  assert(exact_write_response.values_size() == 2);
  assert(exact_write_response.values(0).value().s64() == signed_value);
  assert(exact_write_response.values(1).value().u64() == unsigned_value);

  linuxcnc::v1::HalReadRequest exact_read;
  auto* signed_read = exact_read.add_items();
  signed_read->set_kind(linuxcnc::v1::HAL_ITEM_KIND_SIGNAL);
  signed_read->set_name("grpc-live-s64");
  auto* unsigned_read = exact_read.add_items();
  unsigned_read->set_kind(linuxcnc::v1::HAL_ITEM_KIND_SIGNAL);
  unsigned_read->set_name("grpc-live-u64");
  linuxcnc::v1::HalReadResponse exact_read_response;
  grpc::ClientContext exact_read_context;
  const auto exact_read_status = hal->Read(
      &exact_read_context, exact_read, &exact_read_response);
  assert(exact_read_status.ok());
  assert(exact_read_response.values_size() == 2);
  assert(exact_read_response.values(0).value().s64() == signed_value);
  assert(exact_read_response.values(1).value().u64() == unsigned_value);

  // A disconnected client-owned component must disappear with all its pins.
  grpc::ClientContext component_context;
  component_context.set_deadline(
      std::chrono::system_clock::now() + std::chrono::seconds(5));
  auto component = hal->ComponentSession(&component_context);
  linuxcnc::v1::ComponentSessionMessage component_open;
  component_open.mutable_open()->set_name("grpc-live-component");
  component_open.mutable_open()->set_prefix("grpc-live-component");
  assert(component->Write(component_open));
  linuxcnc::v1::ComponentSessionMessage component_response;
  assert(component->Read(&component_response));
  assert(component_response.has_metadata());
  assert(component_response.metadata().writer_id() == "grpc-live-component");
  assert(!component_response.metadata().ready());

  linuxcnc::v1::ComponentSessionMessage component_pin;
  component_pin.mutable_pin()->set_name("value");
  component_pin.mutable_pin()->set_type(linuxcnc::v1::HAL_TYPE_S64);
  component_pin.mutable_pin()->set_direction(linuxcnc::v1::HAL_PIN_DIRECTION_OUT);
  assert(component->Write(component_pin));
  linuxcnc::v1::ComponentSessionMessage component_ready;
  component_ready.mutable_ready()->set_ready(true);
  assert(component->Write(component_ready));
  assert(component->Read(&component_response));
  assert(component_response.has_metadata());
  assert(component_response.metadata().ready());

  linuxcnc::v1::ComponentSessionMessage component_value;
  component_value.mutable_value()->mutable_item()->set_kind(
      linuxcnc::v1::HAL_ITEM_KIND_PIN);
  component_value.mutable_value()->mutable_item()->set_name(
      "grpc-live-component.value");
  component_value.mutable_value()->mutable_value()->set_type(
      linuxcnc::v1::HAL_TYPE_S64);
  component_value.mutable_value()->mutable_value()->set_s64(signed_value);
  assert(component->Write(component_value));
  bool saw_component_delta = false;
  while (component->Read(&component_response)) {
    if (!component_response.has_delta()) continue;
    for (const auto& value : component_response.delta().values()) {
      if (value.item().name() == "grpc-live-component.value") {
        assert(value.value().s64() == signed_value);
        saw_component_delta = true;
      }
    }
    if (saw_component_delta) break;
  }
  assert(saw_component_delta);
  linuxcnc::v1::ComponentSessionMessage component_close;
  component_close.mutable_close();
  assert(component->Write(component_close));
  component->WritesDone();
  const auto component_status = component->Finish();
  assert(component_status.ok());

  grpc::ClientContext cleanup_topology_context;
  linuxcnc::v1::GetHalTopologyResponse cleanup_topology;
  const auto cleanup_topology_status = hal->GetTopology(
      &cleanup_topology_context, {}, &cleanup_topology);
  assert(cleanup_topology_status.ok());
  for (const auto& item : cleanup_topology.topology().components()) {
    assert(item.name() != "grpc-live-component");
  }
  for (const auto& item : cleanup_topology.topology().pins()) {
    assert(item.name() != "grpc-live-component.value");
  }

  // Cancellation, rather than an explicit Close message, owns the same HAL
  // cleanup path.
  grpc::ClientContext abrupt_context;
  abrupt_context.set_deadline(
      std::chrono::system_clock::now() + std::chrono::seconds(5));
  auto abrupt = hal->ComponentSession(&abrupt_context);
  linuxcnc::v1::ComponentSessionMessage abrupt_open;
  abrupt_open.mutable_open()->set_name("grpc-live-abrupt");
  abrupt_open.mutable_open()->set_prefix("grpc-live-abrupt");
  assert(abrupt->Write(abrupt_open));
  assert(abrupt->Read(&component_response));
  abrupt_context.TryCancel();
  abrupt->WritesDone();
  const auto abrupt_status = abrupt->Finish();
  assert(abrupt_status.error_code() == grpc::StatusCode::CANCELLED);
  bool abrupt_removed = false;
  for (int attempt = 0; attempt < 20 && !abrupt_removed; ++attempt) {
    grpc::ClientContext context;
    linuxcnc::v1::GetHalTopologyResponse current;
    assert(hal->GetTopology(&context, {}, &current).ok());
    abrupt_removed = true;
    for (const auto& item : current.topology().components()) {
      if (item.name() == "grpc-live-abrupt") abrupt_removed = false;
    }
    if (!abrupt_removed) std::this_thread::sleep_for(std::chrono::milliseconds(25));
  }
  assert(abrupt_removed);

  // Scope ownership is exclusive even when two clients share one endpoint.
  auto scope = linuxcnc::v1::ScopeService::NewStub(channel);
  grpc::ClientContext scope_context;
  scope_context.set_deadline(
      std::chrono::system_clock::now() + std::chrono::seconds(10));
  auto scope_session = scope->Session(&scope_context);
  linuxcnc::v1::ScopeSessionMessage scope_acquire;
  scope_acquire.mutable_acquire();
  assert(scope_session->Write(scope_acquire));
  linuxcnc::v1::ScopeSessionMessage scope_response;
  assert(scope_session->Read(&scope_response));
  assert(scope_response.has_status());

  const linuxcnc::v1::HalPinInfo* scope_pin = nullptr;
  for (const auto& candidate : topology.topology().pins()) {
    if (candidate.type() == linuxcnc::v1::HAL_TYPE_BIT ||
        candidate.type() == linuxcnc::v1::HAL_TYPE_FLOAT ||
        candidate.type() == linuxcnc::v1::HAL_TYPE_S32 ||
        candidate.type() == linuxcnc::v1::HAL_TYPE_U32) {
      scope_pin = &candidate;
      break;
    }
  }
  assert(scope_pin != nullptr);
  linuxcnc::v1::ScopeSessionMessage scope_configure;
  auto* acquisition = scope_configure.mutable_configure()->mutable_config();
  acquisition->set_thread_name("servo-thread");
  acquisition->set_multiplier(1);
  acquisition->set_automatic(true);
  auto* scope_channel = acquisition->add_channels();
  scope_channel->set_index(0);
  scope_channel->set_enabled(true);
  scope_channel->mutable_item()->set_kind(linuxcnc::v1::HAL_ITEM_KIND_PIN);
  scope_channel->mutable_item()->set_name(scope_pin->name());
  assert(scope_session->Write(scope_configure));
  do { assert(scope_session->Read(&scope_response)); }
  while (!scope_response.has_status());

  linuxcnc::v1::ScopeSessionMessage scope_run;
  scope_run.mutable_run()->set_mode(linuxcnc::v1::SCOPE_RUN_MODE_ROLL);
  assert(scope_session->Write(scope_run));
  do { assert(scope_session->Read(&scope_response)); }
  while (!scope_response.has_status());

  do { assert(scope_session->Read(&scope_response)); }
  while (!scope_response.has_capture() && !scope_response.has_roll());
  const auto frame_generation = scope_response.has_capture()
      ? scope_response.capture().generation() : scope_response.roll().generation();
  // Leave one frame unacknowledged while several controller polls occur. The
  // controller keeps one coalesced replacement and accounts for skipped frames.
  std::this_thread::sleep_for(std::chrono::milliseconds(300));
  linuxcnc::v1::ScopeSessionMessage scope_ack;
  scope_ack.mutable_ack()->set_generation(frame_generation);
  assert(scope_session->Write(scope_ack));
  do { assert(scope_session->Read(&scope_response)); }
  while (!scope_response.has_capture() && !scope_response.has_roll());
  const auto replacement_generation = scope_response.has_capture()
      ? scope_response.capture().generation() : scope_response.roll().generation();
  const auto replacement_skipped = scope_response.has_capture()
      ? scope_response.capture().skipped_frames()
      : scope_response.roll().skipped_frames();
  assert(replacement_generation > frame_generation);
  assert(replacement_skipped > 0);
  scope_ack.mutable_ack()->set_generation(replacement_generation);
  assert(scope_session->Write(scope_ack));

  linuxcnc::v1::ScopeSessionMessage scope_trigger;
  scope_trigger.mutable_trigger();
  assert(scope_session->Write(scope_trigger));
  do { assert(scope_session->Read(&scope_response)); }
  while (!scope_response.has_status());

  linuxcnc::v1::ScopeSessionMessage scope_stop;
  scope_stop.mutable_stop();
  assert(scope_session->Write(scope_stop));
  do { assert(scope_session->Read(&scope_response)); }
  while (!scope_response.has_status());

  for (const auto mode : {linuxcnc::v1::SCOPE_RUN_MODE_SINGLE,
                          linuxcnc::v1::SCOPE_RUN_MODE_RUN}) {
    assert(scope_session->Write(scope_configure));
    do { assert(scope_session->Read(&scope_response)); }
    while (!scope_response.has_status());
    linuxcnc::v1::ScopeSessionMessage mode_request;
    mode_request.mutable_run()->set_mode(mode);
    assert(scope_session->Write(mode_request));
    do { assert(scope_session->Read(&scope_response)); }
    while (!scope_response.has_status());
    assert(scope_session->Write(scope_stop));
    do { assert(scope_session->Read(&scope_response)); }
    while (!scope_response.has_status());
  }

  grpc::ClientContext conflicting_scope_context;
  conflicting_scope_context.set_deadline(
      std::chrono::system_clock::now() + std::chrono::seconds(5));
  auto conflicting_scope = scope->Session(&conflicting_scope_context);
  (void)conflicting_scope->Write(scope_acquire);
  conflicting_scope->WritesDone();
  while (conflicting_scope->Read(&scope_response)) {}
  const auto conflicting_scope_status = conflicting_scope->Finish();
  assert(conflicting_scope_status.error_code() ==
         grpc::StatusCode::RESOURCE_EXHAUSTED);

  scope_session->WritesDone();
  while (scope_session->Read(&scope_response)) {}
  const auto scope_status = scope_session->Finish();
  assert(scope_status.ok());

  std::cout << "native LinuxCNC gRPC live smoke passed\n";
  return 0;
}
