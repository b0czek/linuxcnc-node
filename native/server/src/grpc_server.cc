#include "linuxcnc_grpc/grpc_server.hpp"

#include "linuxcnc_grpc/command_coordinator.hpp"
#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/grpc_gcode_mapping.hpp"
#include "linuxcnc_grpc/grpc_hal_mapping.hpp"
#include "linuxcnc_grpc/hal_repository.hpp"
#include "linuxcnc_grpc/nml_adapter.hpp"
#include "linuxcnc_grpc/position_telemetry.hpp"
#include "linuxcnc_grpc/position_telemetry_server.hpp"
#include "linuxcnc_grpc/program_workspace.hpp"
#ifndef LINUXCNC_GRPC_HAS_SCOPE
#include "linuxcnc_grpc/scope_manager.hpp"
#endif
#include "linuxcnc_grpc/status_hub.hpp"
#ifdef LINUXCNC_GRPC_HAS_RS274
#include "linuxcnc_grpc/gcode_parser.hpp"
#endif
#ifdef LINUXCNC_GRPC_HAS_HAL
#include "linuxcnc_grpc/hal_adapter.hpp"
#endif
#ifdef LINUXCNC_GRPC_HAS_SCOPE
#include "linuxcnc_grpc/scope_controller.hpp"
#endif

#include "linuxcnc/v1/linuxcnc.grpc.pb.h"
#include <google/protobuf/empty.pb.h>
#include <grpcpp/grpcpp.h>
#include <grpcpp/ext/proto_server_reflection_plugin.h>
#include <grpcpp/health_check_service_interface.h>
#include <grpcpp/resource_quota.h>

#include <csignal>
#include <pthread.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <deque>
#include <fstream>
#include <iostream>
#include <iterator>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

namespace linuxcnc::server {
namespace {

using namespace linuxcnc::v1;

constexpr std::size_t kMaxUploadChunk = 16U * 1024U * 1024U;
constexpr int kMaxGrpcMessageBytes = 16 * 1024 * 1024 + 64 * 1024;
constexpr int kMaxGrpcThreads = 64;

// Keep this list adjacent to ExecuteCommand: adding a protobuf oneof command
// requires adding both its transport mapping and its native NML case.  The
// final enum value assertion catches silent catalog drift at compile time.
constexpr std::array<ExecuteCommandRequest::CommandCase, 51> kCommandCatalog = {
    ExecuteCommandRequest::kSetTaskMode, ExecuteCommandRequest::kSetState,
    ExecuteCommandRequest::kTaskPlanSynch, ExecuteCommandRequest::kResetInterpreter,
    ExecuteCommandRequest::kProgramOpen, ExecuteCommandRequest::kProgramClose,
    ExecuteCommandRequest::kRunProgram, ExecuteCommandRequest::kPauseProgram,
    ExecuteCommandRequest::kResumeProgram, ExecuteCommandRequest::kStepProgram,
    ExecuteCommandRequest::kReverseProgram, ExecuteCommandRequest::kForwardProgram,
    ExecuteCommandRequest::kStop, ExecuteCommandRequest::kAbortTask,
    ExecuteCommandRequest::kSetOptionalStop, ExecuteCommandRequest::kSetBlockDelete,
    ExecuteCommandRequest::kMdi, ExecuteCommandRequest::kSetTrajMode,
    ExecuteCommandRequest::kSetMaxVelocity, ExecuteCommandRequest::kSetFeedRate,
    ExecuteCommandRequest::kSetSpindleOverride, ExecuteCommandRequest::kOverrideLimits,
    ExecuteCommandRequest::kTeleopEnable, ExecuteCommandRequest::kSetFeedOverrideEnable,
    ExecuteCommandRequest::kSetSpindleOverrideEnable, ExecuteCommandRequest::kSetFeedHoldEnable,
    ExecuteCommandRequest::kSetAdaptiveFeedEnable, ExecuteCommandRequest::kHomeJoint,
    ExecuteCommandRequest::kUnhomeJoint, ExecuteCommandRequest::kJogStop,
    ExecuteCommandRequest::kJogContinuous, ExecuteCommandRequest::kJogIncrement,
    ExecuteCommandRequest::kSetMinPositionLimit, ExecuteCommandRequest::kSetMaxPositionLimit,
    ExecuteCommandRequest::kSpindleOn, ExecuteCommandRequest::kSpindleIncrease,
    ExecuteCommandRequest::kSpindleDecrease, ExecuteCommandRequest::kSpindleOff,
    ExecuteCommandRequest::kSpindleBrake, ExecuteCommandRequest::kSetMist,
    ExecuteCommandRequest::kSetFlood, ExecuteCommandRequest::kLoadToolTable,
    ExecuteCommandRequest::kSetTool, ExecuteCommandRequest::kDeleteTool,
    ExecuteCommandRequest::kSetDigitalOutput, ExecuteCommandRequest::kSetAnalogOutput,
    ExecuteCommandRequest::kSetDebugLevel, ExecuteCommandRequest::kSendOperatorError,
    ExecuteCommandRequest::kSendOperatorText, ExecuteCommandRequest::kSendOperatorDisplay,
    ExecuteCommandRequest::kSetRapidRate};
static_assert(kCommandCatalog.size() == 51);
static_assert(ExecuteCommandRequest::kSetRapidRate == 52);

grpc::Status Invalid(const std::string& message) {
  return {grpc::StatusCode::INVALID_ARGUMENT, message};
}

#ifndef LINUXCNC_GRPC_HAS_RS274
grpc::Status Unimplemented(const std::string& message) {
  return {grpc::StatusCode::UNIMPLEMENTED, message};
}
#endif

std::string read_file(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) return {};
  return {std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
}

void fill_status(const NmlStatusSnapshot& source, LinuxCNCStat* target) {
  target->Clear();
  target->set_echo_serial_number(source.echo_serial_number);
  target->set_state(static_cast<RcsStatus>(source.rcs_status));
  target->set_debug(source.debug);
  auto fill_pose = [](const NmlPose& source, Position* target) {
    for (const auto value : source.values) target->add_values(value);
  };
  auto* task = target->mutable_task();
  const auto& task_source = source.task_stat;
  task->set_mode(static_cast<TaskMode>(task_source.mode)); task->set_state(static_cast<TaskState>(task_source.state));
  task->set_exec_state(static_cast<ExecState>(task_source.exec_state)); task->set_interp_state(static_cast<InterpState>(task_source.interp_state));
  task->set_stop_state(static_cast<StopState>(task_source.stop_state)); task->set_call_level(task_source.call_level);
  task->set_motion_line(task_source.motion_line); task->set_current_line(task_source.current_line); task->set_read_line(task_source.read_line);
  task->set_optional_stop_state(task_source.optional_stop_state); task->set_block_delete_state(task_source.block_delete_state);
  task->set_input_timeout(task_source.input_timeout); task->set_file(task_source.file); task->set_command(task_source.command);
  task->set_ini_filename(task_source.ini_filename); fill_pose(task_source.g5x_offset, task->mutable_g5x_offset()); task->set_g5x_index(task_source.g5x_index);
  for (const auto& pose : task_source.g5x_offsets) fill_pose(pose, task->add_g5x_offsets());
  for (const auto value : task_source.g5x_rotations) task->add_g5x_rotations(value);
  fill_pose(task_source.g92_offset, task->mutable_g92_offset()); fill_pose(task_source.g28_position, task->mutable_g28_position());
  fill_pose(task_source.g30_position, task->mutable_g30_position()); task->set_rotation_xy(task_source.rotation_xy);
  fill_pose(task_source.tool_offset, task->mutable_tool_offset());
  auto* g_codes = task->mutable_active_g_codes();
  if (task_source.active_g_codes.size() > 1) g_codes->set_motion_mode(task_source.active_g_codes[1]);
  if (task_source.active_g_codes.size() > 2) g_codes->set_g_mode0(task_source.active_g_codes[2]);
  if (task_source.active_g_codes.size() > 3) g_codes->set_plane(task_source.active_g_codes[3]);
  if (task_source.active_g_codes.size() > 4) g_codes->set_cutter_comp(task_source.active_g_codes[4]);
  if (task_source.active_g_codes.size() > 5) g_codes->set_units(task_source.active_g_codes[5]);
  if (task_source.active_g_codes.size() > 6) g_codes->set_distance_mode(task_source.active_g_codes[6]);
  if (task_source.active_g_codes.size() > 7) g_codes->set_feed_rate_mode(task_source.active_g_codes[7]);
  if (task_source.active_g_codes.size() > 8) g_codes->set_origin(task_source.active_g_codes[8]);
  if (task_source.active_g_codes.size() > 9) g_codes->set_tool_length_offset(task_source.active_g_codes[9]);
  if (task_source.active_g_codes.size() > 10) g_codes->set_retract_mode(task_source.active_g_codes[10]);
  if (task_source.active_g_codes.size() > 11) g_codes->set_path_control(task_source.active_g_codes[11]);
  if (task_source.active_g_codes.size() > 13) g_codes->set_spindle_speed_mode(task_source.active_g_codes[13]);
  if (task_source.active_g_codes.size() > 14) g_codes->set_ijk_distance_mode(task_source.active_g_codes[14]);
  if (task_source.active_g_codes.size() > 15) g_codes->set_lathe_diameter_mode(task_source.active_g_codes[15]);
  if (task_source.active_g_codes.size() > 16) g_codes->set_g92_applied(task_source.active_g_codes[16]);
  auto* m_codes = task->mutable_active_m_codes();
  if (task_source.active_m_codes.size() > 1) m_codes->set_stopping(task_source.active_m_codes[1]);
  if (task_source.active_m_codes.size() > 2) m_codes->set_spindle_control(task_source.active_m_codes[2]);
  if (task_source.active_m_codes.size() > 3) m_codes->set_tool_change(task_source.active_m_codes[3]);
  if (task_source.active_m_codes.size() > 4) m_codes->set_mist_coolant(task_source.active_m_codes[4]);
  if (task_source.active_m_codes.size() > 5) m_codes->set_flood_coolant(task_source.active_m_codes[5]);
  if (task_source.active_m_codes.size() > 6) m_codes->set_override_control(task_source.active_m_codes[6]);
  if (task_source.active_m_codes.size() > 7) m_codes->set_adaptive_feed_control(task_source.active_m_codes[7]);
  if (task_source.active_m_codes.size() > 8) m_codes->set_feed_hold_control(task_source.active_m_codes[8]);
  auto* settings = task->mutable_active_settings();
  if (task_source.active_settings.size() > 1) settings->set_feed_rate(task_source.active_settings[1]);
  if (task_source.active_settings.size() > 2) settings->set_speed(task_source.active_settings[2]);
  if (task_source.active_settings.size() > 3) settings->set_blend_tolerance(task_source.active_settings[3]);
  if (task_source.active_settings.size() > 4) settings->set_naive_cam_tolerance(task_source.active_settings[4]);
  task->set_program_units(static_cast<ProgramUnits>(task_source.program_units)); task->set_interpreter_error_code(task_source.interpreter_error_code);
  task->set_task_paused(task_source.task_paused); task->set_delay_left(task_source.delay_left); task->set_queued_mdi_commands(task_source.queued_mdi_commands);

  const auto& motion_source = source.motion_stat;
  auto* trajectory = target->mutable_motion()->mutable_traj();
  const auto& source_traj = motion_source.traj;
  trajectory->set_linear_units(source_traj.linear_units); trajectory->set_angular_units(source_traj.angular_units); trajectory->set_cycle_time(source_traj.cycle_time);
  trajectory->set_joints(source_traj.joints); trajectory->set_spindles(source_traj.spindles);
  for (const auto axis : source_traj.available_axes) trajectory->add_available_axes(static_cast<AxisName>(axis + 1));
  trajectory->set_mode(static_cast<TrajMode>(source_traj.mode)); trajectory->set_enabled(source_traj.enabled); trajectory->set_in_position(source_traj.in_position);
  trajectory->set_queue(source_traj.queue); trajectory->set_active_queue(source_traj.active_queue); trajectory->set_queue_full(source_traj.queue_full); trajectory->set_id(source_traj.id);
  trajectory->set_paused(source_traj.paused); trajectory->set_single_stepping(source_traj.single_stepping); trajectory->set_feed_rate_override(source_traj.feed_rate_override); trajectory->set_rapid_rate_override(source_traj.rapid_rate_override);
  fill_pose(source_traj.position, trajectory->mutable_position()); fill_pose(source_traj.actual_position, trajectory->mutable_actual_position());
  trajectory->set_acceleration(source_traj.acceleration); trajectory->set_max_velocity(source_traj.max_velocity); trajectory->set_max_acceleration(source_traj.max_acceleration);
  fill_pose(source_traj.probed_position, trajectory->mutable_probed_position()); trajectory->set_probe_tripped(source_traj.probe_tripped); trajectory->set_probing(source_traj.probing); trajectory->set_probe_val(source_traj.probe_val);
  trajectory->set_kinematics_type(static_cast<KinematicsType>(source_traj.kinematics_type)); trajectory->set_motion_type(static_cast<MotionType>(source_traj.motion_type)); trajectory->set_distance_to_go(source_traj.distance_to_go);
  fill_pose(source_traj.dtg, trajectory->mutable_dtg()); trajectory->set_current_velocity(source_traj.current_velocity); trajectory->set_feed_override_enabled(source_traj.feed_override_enabled); trajectory->set_adaptive_feed_enabled(source_traj.adaptive_feed_enabled); trajectory->set_feed_hold_enabled(source_traj.feed_hold_enabled);
  auto* motion = target->mutable_motion();
  for (const auto& joint : motion_source.joints) {
    auto* value = motion->add_joint(); value->set_joint_type(static_cast<JointType>(joint.joint_type)); value->set_units(joint.units); value->set_backlash(joint.backlash); value->set_min_position_limit(joint.min_position_limit); value->set_max_position_limit(joint.max_position_limit); value->set_min_ferror(joint.min_ferror); value->set_max_ferror(joint.max_ferror); value->set_ferror_current(joint.ferror_current); value->set_ferror_high_mark(joint.ferror_high_mark); value->set_output(joint.output); value->set_input(joint.input); value->set_velocity(joint.velocity); value->set_in_position(joint.in_position); value->set_homing(joint.homing); value->set_homed(joint.homed); value->set_fault(joint.fault); value->set_enabled(joint.enabled); value->set_min_soft_limit(joint.min_soft_limit); value->set_max_soft_limit(joint.max_soft_limit); value->set_min_hard_limit(joint.min_hard_limit); value->set_max_hard_limit(joint.max_hard_limit); value->set_override_limits(joint.override_limits);
  }
  for (const auto& axis : motion_source.axes) { auto* value = motion->add_axis(); value->set_min_position_limit(axis.min_position_limit); value->set_max_position_limit(axis.max_position_limit); value->set_velocity(axis.velocity); }
  for (const auto& spindle : motion_source.spindles) { auto* value = motion->add_spindle(); value->set_speed(spindle.speed); value->set_feedback(spindle.feedback); value->set_override(spindle.override_scale); value->set_css_maximum(spindle.css_maximum); value->set_css_factor(spindle.css_factor); value->set_direction(spindle.direction); value->set_brake(spindle.brake); value->set_increasing(spindle.increasing); value->set_enabled(spindle.enabled); value->set_orient_state(static_cast<OrientState>(spindle.orient_state)); value->set_orient_fault(spindle.orient_fault); value->set_spindle_override_enabled(spindle.spindle_override_enabled); value->set_homed(spindle.homed); }
  for (const auto value : motion_source.digital_input) motion->add_digital_input(value);
  for (const auto value : motion_source.digital_output) motion->add_digital_output(value);
  for (const auto value : motion_source.analog_input) motion->add_analog_input(value);
  for (const auto value : motion_source.analog_output) motion->add_analog_output(value);
  const auto& io_source = source.io_stat;
  auto* io = target->mutable_io(); io->mutable_tool()->set_pocket_prepped(io_source.pocket_prepped); io->mutable_tool()->set_tool_in_spindle(io_source.tool_in_spindle); io->mutable_tool()->set_tool_from_pocket(io_source.tool_from_pocket); io->mutable_coolant()->set_mist(io_source.mist); io->mutable_coolant()->set_flood(io_source.flood); io->set_estop(io_source.estop);
  for (const auto& tool : source.tool_table) { auto* value = target->add_tool_table(); value->set_tool_no(tool.tool_no); value->set_pocket_no(tool.pocket_no); fill_pose(tool.offset, value->mutable_offset()); fill_pose(tool.wear_offset, value->mutable_wear_offset()); value->set_diameter(tool.diameter); value->set_front_angle(tool.front_angle); value->set_back_angle(tool.back_angle); value->set_orientation(tool.orientation); value->set_comment(tool.comment); }
}

bool status_equal(const NmlStatusSnapshot& left, const NmlStatusSnapshot& right) {
  LinuxCNCStat left_wire;
  LinuxCNCStat right_wire;
  fill_status(left, &left_wire);
  fill_status(right, &right_wire);
  return left_wire.SerializeAsString() == right_wire.SerializeAsString();
}

void copy_task_delta(const TaskStat& source, TaskStatDelta* target) {
  target->set_mode(source.mode()); target->set_state(source.state()); target->set_exec_state(source.exec_state());
  target->set_interp_state(source.interp_state()); target->set_stop_state(source.stop_state()); target->set_call_level(source.call_level());
  target->set_motion_line(source.motion_line()); target->set_current_line(source.current_line()); target->set_read_line(source.read_line());
  target->set_optional_stop_state(source.optional_stop_state()); target->set_block_delete_state(source.block_delete_state()); target->set_input_timeout(source.input_timeout());
  target->set_file(source.file()); target->set_command(source.command()); target->set_ini_filename(source.ini_filename());
  *target->mutable_g5x_offset() = source.g5x_offset(); target->set_g5x_index(source.g5x_index());
  target->clear_g5x_offsets(); for (const auto& value : source.g5x_offsets()) *target->add_g5x_offsets() = value;
  target->set_replace_g5x_offsets(true); target->clear_g5x_rotations(); for (const auto value : source.g5x_rotations()) target->add_g5x_rotations(value);
  target->set_replace_g5x_rotations(true); *target->mutable_g92_offset() = source.g92_offset(); *target->mutable_g28_position() = source.g28_position(); *target->mutable_g30_position() = source.g30_position(); target->set_rotation_xy(source.rotation_xy()); *target->mutable_tool_offset() = source.tool_offset();
  *target->mutable_active_g_codes() = source.active_g_codes(); *target->mutable_active_m_codes() = source.active_m_codes(); *target->mutable_active_settings() = source.active_settings();
  target->set_program_units(source.program_units()); target->set_interpreter_error_code(source.interpreter_error_code()); target->set_task_paused(source.task_paused()); target->set_delay_left(source.delay_left()); target->set_queued_mdi_commands(source.queued_mdi_commands());
}

std::optional<LinuxCNCStatDelta> make_status_delta(
    const NmlStatusSnapshot& previous,
    const NmlStatusSnapshot& current,
    std::uint64_t sequence) {
  LinuxCNCStat previous_wire;
  LinuxCNCStat current_wire;
  fill_status(previous, &previous_wire);
  fill_status(current, &current_wire);
  LinuxCNCStatDelta delta;
  delta.set_sequence(static_cast<std::int64_t>(sequence));
  bool changed = false;
  if (previous.rcs_status != current.rcs_status) {
    delta.set_state(static_cast<RcsStatus>(current.rcs_status));
    changed = true;
  }
  if (previous.echo_serial_number != current.echo_serial_number) {
    delta.set_echo_serial_number(current.echo_serial_number);
    changed = true;
  }
  if (previous.debug != current.debug) {
    delta.set_debug(current.debug);
    changed = true;
  }
  if (previous_wire.task().SerializeAsString() != current_wire.task().SerializeAsString()) {
    copy_task_delta(current_wire.task(), delta.mutable_task());
    changed = true;
  }
  const auto& previous_motion = previous_wire.motion();
  const auto& current_motion = current_wire.motion();
  if (previous_motion.SerializeAsString() != current_motion.SerializeAsString()) {
    auto* motion = delta.mutable_motion();
    if (previous_motion.traj().SerializeAsString() != current_motion.traj().SerializeAsString())
      *motion->mutable_traj() = current_motion.traj();
    const auto joint_count = std::max(previous_motion.joint_size(), current_motion.joint_size());
    for (int index = 0; index < joint_count; ++index) {
      if (index >= previous_motion.joint_size() || index >= current_motion.joint_size() ||
          previous_motion.joint(index).SerializeAsString() != current_motion.joint(index).SerializeAsString()) {
        auto* item = motion->add_joint(); item->set_index(static_cast<std::uint32_t>(index));
        if (index < current_motion.joint_size()) *item->mutable_value() = current_motion.joint(index);
      }
    }
    const auto axis_count = std::max(previous_motion.axis_size(), current_motion.axis_size());
    for (int index = 0; index < axis_count; ++index) {
      if (index >= previous_motion.axis_size() || index >= current_motion.axis_size() ||
          previous_motion.axis(index).SerializeAsString() != current_motion.axis(index).SerializeAsString()) {
        auto* item = motion->add_axis(); item->set_index(static_cast<std::uint32_t>(index));
        if (index < current_motion.axis_size()) *item->mutable_value() = current_motion.axis(index);
      }
    }
    const auto spindle_count = std::max(previous_motion.spindle_size(), current_motion.spindle_size());
    for (int index = 0; index < spindle_count; ++index) {
      if (index >= previous_motion.spindle_size() || index >= current_motion.spindle_size() ||
          previous_motion.spindle(index).SerializeAsString() != current_motion.spindle(index).SerializeAsString()) {
        auto* item = motion->add_spindle(); item->set_index(static_cast<std::uint32_t>(index));
        if (index < current_motion.spindle_size()) *item->mutable_value() = current_motion.spindle(index);
      }
    }
    const auto changed_ints = [](const auto& left, const auto& right) {
      return left.size() != right.size() || !std::equal(left.begin(), left.end(), right.begin());
    };
    if (changed_ints(previous_motion.digital_input(), current_motion.digital_input())) { motion->set_replace_digital_input(true); for (const auto value : current_motion.digital_input()) motion->add_digital_input(value); }
    if (changed_ints(previous_motion.digital_output(), current_motion.digital_output())) { motion->set_replace_digital_output(true); for (const auto value : current_motion.digital_output()) motion->add_digital_output(value); }
    if (changed_ints(previous_motion.analog_input(), current_motion.analog_input())) { motion->set_replace_analog_input(true); for (const auto value : current_motion.analog_input()) motion->add_analog_input(value); }
    if (changed_ints(previous_motion.analog_output(), current_motion.analog_output())) { motion->set_replace_analog_output(true); for (const auto value : current_motion.analog_output()) motion->add_analog_output(value); }
    changed = true;
  }
  if (previous_wire.io().SerializeAsString() != current_wire.io().SerializeAsString()) {
    *delta.mutable_io()->mutable_tool() = current_wire.io().tool();
    *delta.mutable_io()->mutable_coolant() = current_wire.io().coolant();
    delta.mutable_io()->set_estop(current_wire.io().estop());
    changed = true;
  }
  bool tool_table_changed = previous_wire.tool_table_size() != current_wire.tool_table_size();
  if (!tool_table_changed) {
    for (int index = 0; index < current_wire.tool_table_size(); ++index) {
      if (previous_wire.tool_table(index).SerializeAsString() != current_wire.tool_table(index).SerializeAsString()) {
        tool_table_changed = true;
        break;
      }
    }
  }
  if (tool_table_changed) {
    auto* table = delta.mutable_tool_table(); table->set_replace_all(true);
    for (const auto& value : current_wire.tool_table()) *table->add_replaced() = value;
    changed = true;
  }
  if (!changed) return std::nullopt;
  return delta;
}

template <typename Response>
class UnaryTaskReactor final : public grpc::ServerUnaryReactor {
 public:
  using Task = std::function<grpc::Status(const CancellationToken&, Response*)>;

  UnaryTaskReactor(BoundedExecutor& executor, ActiveCallbackRegistry& registry,
                   Response* response, Task task)
      : response_(response), gate_(std::make_shared<LifetimeGate<UnaryTaskReactor>>(this)) {
    const std::weak_ptr<LifetimeGate<UnaryTaskReactor>> weak_gate = gate_;
    registration_ = registry.register_callback([weak_gate] {
      if (auto gate = weak_gate.lock()) gate->invoke([](UnaryTaskReactor& reactor) {
        reactor.shutdown();
      });
    });
    if (!registration_) {
      shutdown();
      return;
    }
    if (!executor.submit([weak_gate, task = std::move(task), token = token_]() mutable {
          auto gate = weak_gate.lock();
          if (!gate) return;
          grpc::Status status;
          Response response;
          try {
            status = task(*token, &response);
          } catch (const std::exception& error) {
            status = {grpc::StatusCode::INTERNAL, error.what()};
          } catch (...) {
            status = {grpc::StatusCode::INTERNAL, "native worker failed"};
          }
          if (token->cancelled()) {
            status = {grpc::StatusCode::CANCELLED, "RPC cancelled"};
          }
          gate->invoke([&](UnaryTaskReactor& reactor) {
            reactor.complete(std::move(status), std::move(response));
          });
        })) {
      finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
              "blocking work queue is full"});
    }
  }

  void OnCancel() override {
    token_->cancel();
    finish({grpc::StatusCode::CANCELLED, "RPC cancelled"});
  }

  void OnDone() override {
    gate_->detach();
    registration_.reset();
    delete this;
  }

  void shutdown() {
    token_->cancel();
    finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"});
  }

 private:
  void complete(grpc::Status status, Response response) {
    gate_->finish([&](UnaryTaskReactor& reactor) {
      if (status.ok()) *reactor.response_ = std::move(response);
      reactor.Finish(status);
    });
  }
  void finish(grpc::Status status) {
    gate_->finish([&](UnaryTaskReactor& reactor) { reactor.Finish(status); });
  }

  std::shared_ptr<CancellationToken> token_ = std::make_shared<CancellationToken>();
  Response* response_;
  std::shared_ptr<LifetimeGate<UnaryTaskReactor>> gate_;
  ActiveCallbackRegistry::Registration registration_;
};

class CommandTaskReactor final : public grpc::ServerUnaryReactor {
 public:
  using Submit = std::function<grpc::Status(
      const std::shared_ptr<CancellationToken>&, CommandTicket*, CommandWaitPolicy*)>;

  CommandTaskReactor(BoundedExecutor& executor, ActiveCallbackRegistry& registry,
                     ExecuteCommandResponse* response, Submit submit)
      : response_(response),
        gate_(std::make_shared<LifetimeGate<CommandTaskReactor>>(this)) {
    const std::weak_ptr<LifetimeGate<CommandTaskReactor>> weak_gate = gate_;
    registration_ = registry.register_callback([weak_gate] {
      if (auto gate = weak_gate.lock()) gate->invoke([](CommandTaskReactor& reactor) {
        reactor.shutdown();
      });
    });
    if (!registration_) {
      shutdown();
      return;
    }
    if (!executor.submit([weak_gate, submit = std::move(submit), token = token_]() mutable {
          CommandTicket ticket;
          CommandWaitPolicy policy = CommandWaitPolicy::Completed;
          grpc::Status status;
          try {
            status = submit(token, &ticket, &policy);
          } catch (const std::exception& error) {
            status = {grpc::StatusCode::INTERNAL, error.what()};
          }
          auto gate = weak_gate.lock();
          if (!gate) return;
          if (!status.ok()) {
            gate->invoke([&](CommandTaskReactor& reactor) {
              reactor.finish(std::move(status));
            });
            return;
          }
          ticket.observe(policy, [weak_gate](const CommandResult& result) {
            auto observed_gate = weak_gate.lock();
            if (!observed_gate) return;
            observed_gate->invoke([&](CommandTaskReactor& reactor) {
              reactor.complete(result);
            });
          });
        })) {
      finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
              "blocking work queue is full"});
    }
  }

  void OnCancel() override {
    token_->cancel();
    finish({grpc::StatusCode::CANCELLED,
            "command wait cancelled; any accepted work continues"});
  }

  void OnDone() override {
    gate_->detach();
    registration_.reset();
    delete this;
  }

  void shutdown() {
    token_->cancel();
    finish({grpc::StatusCode::UNAVAILABLE,
            "server shutting down; any accepted command continues"});
  }

 private:
  void complete(const CommandResult& result) {
    gate_->finish([&](CommandTaskReactor& reactor) {
    reactor.response_->set_command_sequence(result.sequence);
    if (result.state == CommandState::Failed) {
      reactor.response_->set_status(RCS_STATUS_ERROR);
      reactor.response_->mutable_error()->set_type(NML_MESSAGE_TYPE_NML_ERROR);
      reactor.response_->mutable_error()->set_sequence(
          static_cast<std::int64_t>(result.sequence));
      reactor.response_->mutable_error()->set_message(result.error);
    } else if (result.state == CommandState::Accepted) {
      reactor.response_->set_status(RCS_STATUS_EXEC);
    } else {
      reactor.response_->set_status(RCS_STATUS_DONE);
    }
    reactor.Finish(grpc::Status::OK);
    });
  }

  void finish(grpc::Status status) {
    gate_->finish([&](CommandTaskReactor& reactor) { reactor.Finish(status); });
  }

  ExecuteCommandResponse* response_;
  std::shared_ptr<CancellationToken> token_ = std::make_shared<CancellationToken>();
  std::shared_ptr<LifetimeGate<CommandTaskReactor>> gate_;
  ActiveCallbackRegistry::Registration registration_;
};

using MachineCallbackBase = MachineService::WithCallbackMethod_GetStatus<
    MachineService::WithCallbackMethod_ExecuteCommand<
        MachineService::WithCallbackMethod_WatchErrors<
            MachineService::WithCallbackMethod_WatchStatus<
                MachineService::WithCallbackMethod_ConfigurePositionHistory<
                    MachineService::WithCallbackMethod_ClearPositionHistory<
                        MachineService::Service>>>>>>;

class MachineServiceImpl final : public MachineCallbackBase {
  struct PendingWorkspaceLease {
    PendingWorkspaceLease(std::shared_ptr<ProgramWorkspaceStore> value,
                          std::string id)
        : store(std::move(value)), workspace(std::move(id)) {}
    ~PendingWorkspaceLease() {
      if (release) store->unpin(workspace);
    }
    std::shared_ptr<ProgramWorkspaceStore> store;
    std::string workspace;
    bool release = true;
  };

  struct WorkspaceActivation {
    explicit WorkspaceActivation(std::shared_ptr<ProgramWorkspaceStore> value)
        : store(std::move(value)) {}
    std::mutex mutex;
    std::string active;
    std::shared_ptr<ProgramWorkspaceStore> store;
  };

 public:
  explicit MachineServiceImpl(const DaemonConfig& config,
                              std::shared_ptr<ProgramWorkspaceStore> workspaces,
                              std::shared_ptr<PositionTelemetry> positions,
                              BoundedExecutor& blocking,
                              AdmissionCounter& stream_admission)
      : nml_(config.nml_file, config.command_queue_capacity),
        blocking_(blocking),
        stream_admission_(stream_admission),
        workspaces_(std::move(workspaces)),
        workspace_activation_(std::make_shared<WorkspaceActivation>(workspaces_)),
        positions_(std::move(positions)),
        status_period_(config.status_period),
        error_period_(config.error_period),
        position_period_(config.position_period),
        replay_capacity_(std::max<std::size_t>(1, config.status_replay_capacity)),
        stopping_(false),
        position_poller_([this] { poll_positions(); }) {}

  ~MachineServiceImpl() override {
    begin_shutdown();
  }

  void begin_shutdown() {
    if (stopping_.exchange(true, std::memory_order_relaxed)) return;
    status_wakes_.close();
    error_wakes_.close();
    callbacks_.shutdown();
    position_condition_.notify_all();
    if (position_poller_.joinable()) position_poller_.join();
  }

  grpc::ServerUnaryReactor* GetStatus(grpc::CallbackServerContext*,
                                     const GetStatusRequest*,
                                     GetStatusResponse* response) override {
    return new UnaryTaskReactor<GetStatusResponse>(
        blocking_, callbacks_, response, [this](const CancellationToken& cancelled,
                                    GetStatusResponse* task_response) {
          if (cancelled.cancelled()) {
            return grpc::Status(grpc::StatusCode::CANCELLED, "RPC cancelled");
          }
          return get_status(task_response);
        });
  }

  grpc::Status get_status(GetStatusResponse* response) {
    NmlStatusSnapshot snapshot;
    std::uint64_t sequence = 0;
    if (!read_status(&snapshot, &sequence)) return {grpc::StatusCode::UNAVAILABLE,
                                         "LinuxCNC NML status channel is unavailable"};
    response->set_sequence(sequence);
    fill_status(snapshot, response->mutable_status());
    return grpc::Status::OK;
  }

  grpc::ServerWriteReactor<WatchStatusEvent>* WatchStatus(
      grpc::CallbackServerContext*, const WatchStatusRequest* request) override {
    return new StatusReactor(*this, request->after_sequence());
  }

  grpc::ServerUnaryReactor* ExecuteCommand(
      grpc::CallbackServerContext*, const ExecuteCommandRequest* request,
      ExecuteCommandResponse* response) override {
    auto owned_request = std::make_shared<ExecuteCommandRequest>(*request);
    return new CommandTaskReactor(
        blocking_, callbacks_, response,
        [this, owned_request = std::move(owned_request)](
                        const std::shared_ptr<CancellationToken>& cancelled,
                        CommandTicket* ticket,
                        CommandWaitPolicy* policy) {
          return submit_command(cancelled, owned_request.get(), ticket, policy);
        });
  }

  grpc::Status submit_command(const std::shared_ptr<CancellationToken>& cancelled,
                              const ExecuteCommandRequest* request,
                              CommandTicket* ticket,
                              CommandWaitPolicy* policy) {
    NmlCommand command;
    switch (request->command_case()) {
      case ExecuteCommandRequest::kSetTaskMode:
        command.kind = NmlCommandKind::SetTaskMode;
        command.integer = static_cast<std::int32_t>(request->set_task_mode().mode());
        break;
      case ExecuteCommandRequest::kSetState:
        command.kind = NmlCommandKind::SetTaskState;
        command.integer = static_cast<std::int32_t>(request->set_state().state());
        break;
      case ExecuteCommandRequest::kTaskPlanSynch: command.kind = NmlCommandKind::TaskPlanSynch; break;
      case ExecuteCommandRequest::kResetInterpreter: command.kind = NmlCommandKind::ResetInterpreter; break;
      case ExecuteCommandRequest::kProgramOpen:
        command.kind = NmlCommandKind::ProgramOpen;
        if (!workspaces_ || request->program_open().entry().workspace_id().empty())
          return Invalid("program_open requires a workspace handle");
        {
          const auto workspace = request->program_open().entry().workspace_id();
          const auto relative_path = request->program_open().entry().relative_path();
          std::filesystem::path resolved_entry;
          if (!workspaces_->resolve_entry(workspace, relative_path, &resolved_entry)) {
            return Invalid("program workspace entry is missing or unsafe");
          }
          if (!workspaces_->pin(workspace)) {
            return Invalid("program workspace became unavailable");
          }
          auto lease = std::make_shared<PendingWorkspaceLease>(workspaces_, workspace);
          command.prepare = [store = workspaces_, workspace, relative_path,
                             lease](NmlCommand& prepared) {
            std::filesystem::path materialized;
            if (!store->materialize(workspace, relative_path, &materialized)) {
              throw std::runtime_error("program workspace entry became unavailable or unsafe");
            }
            prepared.path = materialized.string();
          };
          command.on_completed = [activation = workspace_activation_, workspace,
                                  lease] {
            std::lock_guard lock(activation->mutex);
            if (activation->active == workspace) return;
            lease->release = false;  // temporary lease becomes the active lease
            if (!activation->active.empty())
              activation->store->unpin(activation->active);
            activation->active = workspace;
          };
        }
        break;
      case ExecuteCommandRequest::kProgramClose:
        command.kind = NmlCommandKind::ProgramClose;
        command.on_completed = [activation = workspace_activation_] {
          std::lock_guard lock(activation->mutex);
          if (!activation->active.empty()) {
            activation->store->unpin(activation->active);
            activation->active.clear();
          }
        };
        break;
      case ExecuteCommandRequest::kRunProgram:
        command.kind = NmlCommandKind::Run;
        command.integer = request->run_program().start_line();
        break;
      case ExecuteCommandRequest::kPauseProgram: command.kind = NmlCommandKind::Pause; break;
      case ExecuteCommandRequest::kResumeProgram: command.kind = NmlCommandKind::Resume; break;
      case ExecuteCommandRequest::kStepProgram: command.kind = NmlCommandKind::Step; break;
      case ExecuteCommandRequest::kReverseProgram: command.kind = NmlCommandKind::Reverse; break;
      case ExecuteCommandRequest::kForwardProgram: command.kind = NmlCommandKind::Forward; break;
      case ExecuteCommandRequest::kStop: command.kind = NmlCommandKind::Stop; break;
      case ExecuteCommandRequest::kAbortTask: command.kind = NmlCommandKind::AbortTask; break;
      case ExecuteCommandRequest::kSetOptionalStop:
        command.kind = NmlCommandKind::SetOptionalStop;
        command.boolean = request->set_optional_stop().enable();
        break;
      case ExecuteCommandRequest::kSetBlockDelete:
        command.kind = NmlCommandKind::SetBlockDelete;
        command.boolean = request->set_block_delete().enable();
        break;
      case ExecuteCommandRequest::kMdi:
        command.kind = NmlCommandKind::Mdi;
        command.text = request->mdi().command();
        break;
      case ExecuteCommandRequest::kSetTrajMode:
        command.kind = NmlCommandKind::SetTrajMode;
        command.integer = static_cast<std::int32_t>(request->set_traj_mode().mode());
        break;
      case ExecuteCommandRequest::kSetMaxVelocity:
        command.kind = NmlCommandKind::SetMaxVelocity;
        command.number = request->set_max_velocity().value();
        break;
      case ExecuteCommandRequest::kSetFeedRate:
        command.kind = NmlCommandKind::SetFeedRate;
        command.number = request->set_feed_rate().value();
        break;
      case ExecuteCommandRequest::kSetRapidRate:
        command.kind = NmlCommandKind::SetRapidRate;
        command.number = request->set_rapid_rate().value();
        break;
      case ExecuteCommandRequest::kSetSpindleOverride:
        command.kind = NmlCommandKind::SetSpindleOverride;
        command.number = request->set_spindle_override().scale();
        command.integer = request->set_spindle_override().has_spindle_index()
            ? request->set_spindle_override().spindle_index() : 0;
        break;
      case ExecuteCommandRequest::kOverrideLimits: command.kind = NmlCommandKind::OverrideLimits; break;
      case ExecuteCommandRequest::kTeleopEnable:
        command.kind = NmlCommandKind::TeleopEnable;
        command.boolean = request->teleop_enable().enable();
        break;
      case ExecuteCommandRequest::kSetFeedOverrideEnable:
        command.kind = NmlCommandKind::SetFeedOverrideEnable;
        command.boolean = request->set_feed_override_enable().enable();
        break;
      case ExecuteCommandRequest::kSetSpindleOverrideEnable:
        command.kind = NmlCommandKind::SetSpindleOverrideEnable;
        command.boolean = request->set_spindle_override_enable().enable();
        command.integer = request->set_spindle_override_enable().has_spindle_index()
            ? request->set_spindle_override_enable().spindle_index() : 0;
        break;
      case ExecuteCommandRequest::kSetFeedHoldEnable:
        command.kind = NmlCommandKind::SetFeedHoldEnable;
        command.boolean = request->set_feed_hold_enable().enable();
        break;
      case ExecuteCommandRequest::kSetAdaptiveFeedEnable:
        command.kind = NmlCommandKind::SetAdaptiveFeedEnable;
        command.boolean = request->set_adaptive_feed_enable().enable();
        break;
      case ExecuteCommandRequest::kHomeJoint:
        command.kind = NmlCommandKind::HomeJoint;
        command.integer = request->home_joint().joint_index();
        break;
      case ExecuteCommandRequest::kUnhomeJoint:
        command.kind = NmlCommandKind::UnhomeJoint;
        command.integer = request->unhome_joint().joint_index();
        break;
      case ExecuteCommandRequest::kJogStop:
        command.kind = NmlCommandKind::JogStop;
        command.integer = request->jog_stop().axis_or_joint_index();
        command.boolean = request->jog_stop().is_joint_jog();
        break;
      case ExecuteCommandRequest::kJogContinuous:
        command.kind = NmlCommandKind::JogContinuous;
        command.integer = request->jog_continuous().axis_or_joint_index();
        command.boolean = request->jog_continuous().is_joint_jog();
        command.number = request->jog_continuous().speed();
        break;
      case ExecuteCommandRequest::kJogIncrement:
        command.kind = NmlCommandKind::JogIncrement;
        command.integer = request->jog_increment().axis_or_joint_index();
        command.boolean = request->jog_increment().is_joint_jog();
        command.number = request->jog_increment().speed();
        command.number2 = request->jog_increment().increment();
        break;
      case ExecuteCommandRequest::kSetMinPositionLimit:
        command.kind = NmlCommandKind::SetMinPositionLimit;
        command.integer = request->set_min_position_limit().joint_index();
        command.number = request->set_min_position_limit().limit();
        break;
      case ExecuteCommandRequest::kSetMaxPositionLimit:
        command.kind = NmlCommandKind::SetMaxPositionLimit;
        command.integer = request->set_max_position_limit().joint_index();
        command.number = request->set_max_position_limit().limit();
        break;
      case ExecuteCommandRequest::kSpindleOn:
        command.kind = NmlCommandKind::SpindleOn;
        command.number = request->spindle_on().speed();
        command.integer = request->spindle_on().has_spindle_index()
            ? request->spindle_on().spindle_index() : 0;
        command.boolean = request->spindle_on().wait_for_speed();
        break;
      case ExecuteCommandRequest::kSpindleIncrease:
        command.kind = NmlCommandKind::SpindleIncrease;
        command.integer = request->spindle_increase().spindle_index();
        break;
      case ExecuteCommandRequest::kSpindleDecrease:
        command.kind = NmlCommandKind::SpindleDecrease;
        command.integer = request->spindle_decrease().spindle_index();
        break;
      case ExecuteCommandRequest::kSpindleOff:
        command.kind = NmlCommandKind::SpindleOff;
        command.integer = request->spindle_off().spindle_index();
        break;
      case ExecuteCommandRequest::kSpindleBrake:
        command.kind = NmlCommandKind::SpindleBrake;
        command.integer = request->spindle_brake().has_spindle_index()
            ? request->spindle_brake().spindle_index() : 0;
        command.boolean = request->spindle_brake().engage();
        break;
      case ExecuteCommandRequest::kSetMist:
        command.kind = NmlCommandKind::SetMist;
        command.boolean = request->set_mist().enable();
        break;
      case ExecuteCommandRequest::kSetFlood:
        command.kind = NmlCommandKind::SetFlood;
        command.boolean = request->set_flood().enable();
        break;
      case ExecuteCommandRequest::kLoadToolTable: command.kind = NmlCommandKind::LoadToolTable; break;
      case ExecuteCommandRequest::kSetTool: {
        command.kind = NmlCommandKind::SetTool;
        const auto& source = request->set_tool().tool();
        command.tool.tool_no = source.tool_no();
        command.tool.pocket_no = source.pocket_no();
        command.tool.diameter = source.diameter();
        command.tool.front_angle = source.front_angle();
        command.tool.back_angle = source.back_angle();
        command.tool.orientation = source.orientation();
        command.tool.comment = source.comment();
        for (int index = 0; index < source.offset().values_size() && index < 9; ++index)
          command.tool.offset.values[static_cast<std::size_t>(index)] = source.offset().values(index);
        for (int index = 0; index < source.wear_offset().values_size() && index < 9; ++index)
          command.tool.wear_offset.values[static_cast<std::size_t>(index)] = source.wear_offset().values(index);
        break;
      }
      case ExecuteCommandRequest::kDeleteTool:
        command.kind = NmlCommandKind::DeleteTool;
        command.integer = request->delete_tool().tool_no();
        break;
      case ExecuteCommandRequest::kSetDigitalOutput:
        command.kind = NmlCommandKind::SetDigitalOutput;
        command.integer = request->set_digital_output().index();
        command.boolean = request->set_digital_output().value();
        break;
      case ExecuteCommandRequest::kSetAnalogOutput:
        command.kind = NmlCommandKind::SetAnalogOutput;
        command.integer = request->set_analog_output().index();
        command.number = request->set_analog_output().value();
        break;
      case ExecuteCommandRequest::kSetDebugLevel:
        command.kind = NmlCommandKind::SetDebugLevel;
        command.integer = request->set_debug_level().level();
        break;
      case ExecuteCommandRequest::kSendOperatorError:
        command.kind = NmlCommandKind::SendOperatorError;
        command.text = request->send_operator_error().message();
        break;
      case ExecuteCommandRequest::kSendOperatorText:
        command.kind = NmlCommandKind::SendOperatorText;
        command.text = request->send_operator_text().message();
        break;
      case ExecuteCommandRequest::kSendOperatorDisplay:
        command.kind = NmlCommandKind::SendOperatorDisplay;
        command.text = request->send_operator_display().message();
        break;
      default:
        return Invalid("execute_command requires a supported command oneof");
    }
    if (!nml_.connect()) return {grpc::StatusCode::UNAVAILABLE,
                                 "LinuxCNC NML command channel is unavailable"};
    try {
      *ticket = nml_.submit(std::move(command), [cancelled] {
        return cancelled->cancelled();
      });
    } catch (const std::exception& error) {
      const auto message = std::string(error.what());
      const auto code = message.find("queue is full") != std::string::npos
          ? grpc::StatusCode::RESOURCE_EXHAUSTED : grpc::StatusCode::INTERNAL;
      return {code, message};
    }
    *policy = request->wait_policy() == WAIT_POLICY_ACCEPTED
        ? CommandWaitPolicy::Accepted : CommandWaitPolicy::Completed;
    return grpc::Status::OK;
  }

  grpc::ServerWriteReactor<LinuxCNCError>* WatchErrors(
      grpc::CallbackServerContext*, const google::protobuf::Empty*) override {
    return new ErrorReactor(*this);
  }

  grpc::ServerUnaryReactor* ConfigurePositionHistory(
      grpc::CallbackServerContext*, const PositionHistoryConfig* request,
      google::protobuf::Empty* response) override {
    auto owned_request = std::make_shared<PositionHistoryConfig>(*request);
    return new UnaryTaskReactor<google::protobuf::Empty>(
        blocking_, callbacks_, response, [this, owned_request = std::move(owned_request)](
            const CancellationToken& cancelled, google::protobuf::Empty*) {
          if (cancelled.cancelled()) {
            return grpc::Status(grpc::StatusCode::CANCELLED, "RPC cancelled");
          }
          return configure_position(*owned_request);
        });
  }

  grpc::Status configure_position(const PositionHistoryConfig& request) {
    if (request.capacity() > 100000) {
      return {grpc::StatusCode::RESOURCE_EXHAUSTED,
              "position history capacity exceeds 100000 samples"};
    }
    if (request.capacity() > 0) {
      positions_->configure(request.capacity());
    }
    {
      std::lock_guard lock(position_mutex_);
      position_enabled_ = request.enabled();
      if (request.sample_period_ms() > 0) {
        position_period_ = std::chrono::milliseconds(request.sample_period_ms());
      }
    }
    if (!request.enabled()) positions_->clear();
    return grpc::Status::OK;
  }

  grpc::ServerUnaryReactor* ClearPositionHistory(
      grpc::CallbackServerContext*, const google::protobuf::Empty*,
      google::protobuf::Empty* response) override {
    return new UnaryTaskReactor<google::protobuf::Empty>(
        blocking_, callbacks_, response, [this](const CancellationToken& cancelled,
                                   google::protobuf::Empty*) {
          if (cancelled.cancelled()) {
            return grpc::Status(grpc::StatusCode::CANCELLED, "RPC cancelled");
          }
          positions_->clear();
          return grpc::Status::OK;
        });
  }

 private:
  class StatusReactor final : public grpc::ServerWriteReactor<WatchStatusEvent> {
   public:
    StatusReactor(MachineServiceImpl& service, std::uint64_t after)
        : service_(service), after_(after),
          admitted_(service_.stream_admission_.acquire()),
          gate_(std::make_shared<LifetimeGate<StatusReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<StatusReactor>> weak_gate = gate_;
      registration_ = service_.callbacks_.register_callback([weak_gate] {
        if (auto gate = weak_gate.lock()) gate->invoke([](StatusReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_) {
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                "stream admission limit reached"});
        return;
      }
      subscription_ = service_.status_wakes_.subscribe([weak_gate](const std::uint64_t&) {
        auto gate = weak_gate.lock();
        if (gate) gate->invoke([](StatusReactor& reactor) { reactor.schedule_wake(); });
      });
      schedule_wake();
    }

    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](StatusReactor& reactor) { reactor.write_done(ok); });
    }

    void OnCancel() override {
      gate_->invoke([](StatusReactor& reactor) {
        reactor.subscription_.reset();
        reactor.finish({grpc::StatusCode::CANCELLED, "status stream cancelled"});
      });
    }

    void OnDone() override {
      subscription_.reset();
      gate_->detach();
      registration_.reset();
      if (admitted_) service_.stream_admission_.release();
      delete this;
    }

    void shutdown() {
      subscription_.reset();
      finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }

   private:
    void write_done(bool ok) {
      writing_ = false;
      if (!ok) {
        finish(grpc::Status::OK);
        return;
      }
      previous_ = std::move(writing_snapshot_);
      cursor_ = writing_sequence_;
      initial_written_ = true;
      schedule_wake();
    }
    void schedule_wake() {
      if (gate_->state() != LifetimeGate<StatusReactor>::State::Open ||
          wake_scheduled_.exchange(true)) return;
      const std::weak_ptr<LifetimeGate<StatusReactor>> weak_gate = gate_;
      if (!service_.blocking_.submit([weak_gate] {
            auto gate = weak_gate.lock();
            if (gate) gate->invoke([](StatusReactor& reactor) {
              reactor.wake_scheduled_.store(false);
              reactor.wake();
            });
          })) {
        wake_scheduled_.store(false);
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                "wire encoding queue is full"});
      }
    }

    void wake() {
      if (writing_ || gate_->state() != LifetimeGate<StatusReactor>::State::Open) return;
      const auto history = service_.status_history();
      if (history.empty()) {
        finish({grpc::StatusCode::UNAVAILABLE,
                "LinuxCNC NML status snapshot is unavailable"});
        return;
      }
      const auto& latest = history.back();
      message_.Clear();
      if (!initial_written_) {
        const auto base = std::find_if(history.begin(), history.end(),
            [this](const auto& entry) { return entry.sequence == after_; });
        if (after_ != 0 && base != history.end()) {
          message_.set_sequence(latest.sequence);
          auto* replay = message_.mutable_replay();
          replay->set_from_sequence(after_);
          replay->set_to_sequence(latest.sequence);
          auto prior = base->snapshot;
          for (auto entry = std::next(base); entry != history.end(); ++entry) {
            auto delta = make_status_delta(prior, entry->snapshot, entry->sequence);
            if (delta) *replay->add_deltas() = std::move(*delta);
            prior = entry->snapshot;
          }
        } else {
          message_.set_sequence(latest.sequence);
          fill_status(latest.snapshot, message_.mutable_snapshot());
        }
      } else {
        if (latest.sequence == cursor_) return;
        const bool cursor_retained = std::any_of(history.begin(), history.end(),
            [this](const auto& entry) { return entry.sequence == cursor_; });
        if (!cursor_retained) {
          message_.set_sequence(latest.sequence);
          fill_status(latest.snapshot, message_.mutable_snapshot());
        } else {
          auto delta = make_status_delta(previous_, latest.snapshot, latest.sequence);
          if (!delta) return;
          message_.set_sequence(latest.sequence);
          *message_.mutable_delta() = std::move(*delta);
        }
      }
      writing_snapshot_ = latest.snapshot;
      writing_sequence_ = latest.sequence;
      writing_ = true;
      StartWrite(&message_);
    }

    void finish(grpc::Status status) {
      gate_->finish([&](StatusReactor& reactor) {
        reactor.subscription_.reset();
        reactor.Finish(status);
      });
    }

    MachineServiceImpl& service_;
    const std::uint64_t after_;
    bool admitted_ = false;
    bool initial_written_ = false;
    bool writing_ = false;
    std::uint64_t cursor_ = 0;
    std::uint64_t writing_sequence_ = 0;
    NmlStatusSnapshot previous_;
    NmlStatusSnapshot writing_snapshot_;
    WatchStatusEvent message_;
    std::atomic<bool> wake_scheduled_{false};
    SubscriptionHub<std::uint64_t>::Subscription subscription_;
    std::shared_ptr<LifetimeGate<StatusReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };

  class ErrorReactor final : public grpc::ServerWriteReactor<LinuxCNCError> {
   public:
    explicit ErrorReactor(MachineServiceImpl& service)
        : service_(service),
          admitted_(service_.stream_admission_.acquire()),
          gate_(std::make_shared<LifetimeGate<ErrorReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<ErrorReactor>> weak_gate = gate_;
      registration_ = service_.callbacks_.register_callback([weak_gate] {
        if (auto gate = weak_gate.lock()) gate->invoke([](ErrorReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_) {
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                "stream admission limit reached"});
        return;
      }
      cursor_ = service_.errors_.next_sequence() - 1;
      subscription_ = service_.error_wakes_.subscribe([weak_gate](const std::uint64_t&) {
        auto gate = weak_gate.lock();
        if (gate) gate->invoke([](ErrorReactor& reactor) { reactor.wake(); });
      });
      wake();
    }

    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](ErrorReactor& reactor) { reactor.write_done(ok); });
    }

    void OnCancel() override {
      gate_->invoke([](ErrorReactor& reactor) {
        reactor.subscription_.reset();
        reactor.finish({grpc::StatusCode::CANCELLED, "error stream cancelled"});
      });
    }

    void OnDone() override {
      subscription_.reset();
      gate_->detach();
      registration_.reset();
      if (admitted_) service_.stream_admission_.release();
      delete this;
    }

    void shutdown() {
      subscription_.reset();
      finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }

   private:
    void write_done(bool ok) {
      writing_ = false;
      if (!ok) {
        finish(grpc::Status::OK);
        return;
      }
      cursor_ = writing_sequence_;
      wake();
    }
    void wake() {
      if (writing_ || gate_->state() != LifetimeGate<ErrorReactor>::State::Open) return;
      const auto available = service_.errors_.after(cursor_);
      if (available.behind) {
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                "error reader fell behind retained events"});
        return;
      }
      if (available.entries.empty()) return;
      const auto& entry = available.entries.front();
      message_.Clear();
      message_.set_type(static_cast<NmlMessageType>(entry.event.type));
      message_.set_message(entry.event.message);
      message_.set_sequence(static_cast<std::int64_t>(entry.sequence));
      writing_sequence_ = entry.sequence;
      writing_ = true;
      StartWrite(&message_);
    }

    void finish(grpc::Status status) {
      gate_->finish([&](ErrorReactor& reactor) {
        reactor.subscription_.reset();
        reactor.Finish(status);
      });
    }

    MachineServiceImpl& service_;
    bool admitted_ = false;
    std::uint64_t cursor_ = 0;
    std::uint64_t writing_sequence_ = 0;
    LinuxCNCError message_;
    bool writing_ = false;
    SubscriptionHub<std::uint64_t>::Subscription subscription_;
    std::shared_ptr<LifetimeGate<ErrorReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };

  struct StatusHistoryEntry {
    std::uint64_t sequence = 0;
    NmlStatusSnapshot snapshot;
  };

  bool read_status(NmlStatusSnapshot* snapshot, std::uint64_t* sequence) {
    NmlStatusSnapshot fresh;
    if (nml_.poll_status(&fresh)) observe_status(fresh);
    std::lock_guard lock(status_mutex_);
    if (!have_latest_) return false;
    *snapshot = latest_;
    if (sequence) *sequence = sequence_;
    return true;
  }

  std::vector<StatusHistoryEntry> status_history() const {
    std::lock_guard lock(status_mutex_);
    return {history_.begin(), history_.end()};
  }

  void poll_positions() {
    auto next_status = std::chrono::steady_clock::now();
    auto next_error = next_status;
    while (!stopping_.load(std::memory_order_relaxed)) {
      NmlStatusSnapshot snapshot;
      bool enabled = false;
      {
        std::lock_guard lock(position_mutex_);
        enabled = position_enabled_;
      }
      if (nml_.poll_status(&snapshot)) {
        const auto now = std::chrono::steady_clock::now();
        if (now >= next_status) {
          observe_status(snapshot);
          next_status = now + status_period_;
        }
        if (enabled) {
          PositionSample sample;
          for (std::size_t index = 0;
               index < sample.coordinates.size() && index < snapshot.actual_position.size();
               ++index) {
            sample.coordinates[index] = snapshot.actual_position[index];
          }
          sample.motion_type = snapshot.motion_type;
          positions_->append(sample);
        }
      }
      const auto now = std::chrono::steady_clock::now();
      if (now >= next_error) {
        if (auto error = nml_.poll_error()) {
          const auto sequence = errors_.publish(std::move(*error));
          error_wakes_.publish(sequence);
        }
        next_error = now + error_period_;
      }
      std::unique_lock lock(position_mutex_);
      const auto period = position_period_;
      position_condition_.wait_for(lock, period, [this] {
        return stopping_.load(std::memory_order_relaxed);
      });
    }
  }

  void observe_status(const NmlStatusSnapshot& fresh) {
    // ProgramClose may originate outside this RPC service. Reconcile the pin
    // from authoritative LinuxCNC status so TTL cleanup resumes once no file
    // is open, regardless of which client initiated the close.
    if (fresh.task_stat.file.empty() && fresh.file.empty()) {
      std::lock_guard activation_lock(workspace_activation_->mutex);
      if (!workspace_activation_->active.empty()) {
        workspace_activation_->store->unpin(workspace_activation_->active);
        workspace_activation_->active.clear();
      }
    }
    std::uint64_t published = 0;
    std::unique_lock lock(status_mutex_);
    if (!have_latest_) {
      sequence_ = fresh.echo_serial_number > 0
          ? static_cast<std::uint64_t>(fresh.echo_serial_number) : 1;
      latest_ = fresh;
      have_latest_ = true;
      history_.push_back(StatusHistoryEntry{sequence_, latest_});
      published = sequence_;
    } else if (!status_equal(latest_, fresh)) {
      ++sequence_;
      latest_ = fresh;
      history_.push_back(StatusHistoryEntry{sequence_, latest_});
      while (history_.size() > replay_capacity_) history_.pop_front();
      published = sequence_;
    }
    lock.unlock();
    if (published != 0) status_wakes_.publish(published);
  }

  NmlAdapter nml_;
  BoundedExecutor& blocking_;
  AdmissionCounter& stream_admission_;
  std::shared_ptr<ProgramWorkspaceStore> workspaces_;
  std::shared_ptr<WorkspaceActivation> workspace_activation_;
  std::shared_ptr<PositionTelemetry> positions_;
  const std::chrono::milliseconds status_period_;
  const std::chrono::milliseconds error_period_;
  std::chrono::milliseconds position_period_;
  const std::size_t replay_capacity_;
  mutable std::mutex status_mutex_;
  NmlStatusSnapshot latest_;
  bool have_latest_ = false;
  std::uint64_t sequence_ = 0;
  std::deque<StatusHistoryEntry> history_;
  SequencedRing<NmlErrorEvent> errors_{256};
  SubscriptionHub<std::uint64_t> error_wakes_;
  SubscriptionHub<std::uint64_t> status_wakes_;
  ActiveCallbackRegistry callbacks_;
  std::mutex position_mutex_;
  std::condition_variable position_condition_;
  bool position_enabled_ = true;
  std::atomic<bool> stopping_;
  std::thread position_poller_;
};

using ProgramCallbackBase = ProgramService::WithCallbackMethod_CreateWorkspace<
    ProgramService::WithCallbackMethod_UploadWorkspace<
        ProgramService::WithCallbackMethod_DeleteWorkspace<
            ProgramService::WithCallbackMethod_ParseProgram<ProgramService::Service>>>>;

class ProgramServiceImpl final : public ProgramCallbackBase {
  class UploadReactor;
  class ParseReactor;

 public:
  explicit ProgramServiceImpl(const DaemonConfig& config,
                              std::shared_ptr<ProgramWorkspaceStore> store,
                              BoundedExecutor& blocking,
                              BoundedExecutor& parser_worker,
                              AdmissionCounter& upload_admission,
                              AdmissionCounter& stream_admission)
      : store_(std::move(store)),
        blocking_(blocking),
        parser_worker_(parser_worker),
        upload_admission_(upload_admission),
        stream_admission_(stream_admission),
        ini_file_(config.ini_file),
        batch_size_(config.gcode_batch_size),
        default_ttl_(config.workspace_ttl),
        max_upload_bytes_(config.workspace_quota_bytes),
        prune_period_(std::max(std::chrono::seconds(1),
                               std::min(config.workspace_ttl,
                                        std::chrono::duration_cast<std::chrono::seconds>(
                                            std::chrono::hours(1))))),
        stopping_(false),
        pruner_([this] {
          std::unique_lock lock(prune_mutex_);
          while (!stopping_.load(std::memory_order_relaxed)) {
            if (prune_condition_.wait_for(lock, prune_period_, [this] {
                  return stopping_.load(std::memory_order_relaxed);
                })) {
              break;
            }
            lock.unlock();
            store_->prune_expired();
            lock.lock();
          }
        }) {}

  ~ProgramServiceImpl() override {
    begin_shutdown();
  }

  void begin_shutdown() {
    if (stopping_.exchange(true, std::memory_order_relaxed)) return;
    prune_condition_.notify_all();
    if (pruner_.joinable()) pruner_.join();
    callbacks_.shutdown();
  }

  grpc::ServerUnaryReactor* CreateWorkspace(
      grpc::CallbackServerContext*, const CreateWorkspaceRequest* request,
      CreateWorkspaceResponse* response) override {
    auto owned_request = std::make_shared<CreateWorkspaceRequest>(*request);
    return new UnaryTaskReactor<CreateWorkspaceResponse>(
        blocking_, callbacks_, response, [this, owned_request = std::move(owned_request)](
            const CancellationToken& cancelled, CreateWorkspaceResponse* task_response) {
          if (cancelled.cancelled()) return grpc::Status(grpc::StatusCode::CANCELLED, "RPC cancelled");
          return create_workspace(*owned_request, task_response);
        });
  }

  grpc::Status create_workspace(const CreateWorkspaceRequest& request,
                                CreateWorkspaceResponse* response) {
    try {
      const auto ttl = request.ttl_seconds() == 0
          ? std::chrono::seconds::zero()
          : std::chrono::seconds(request.ttl_seconds());
      response->set_workspace_id(store_->create(ttl));
      const auto effective_ttl = ttl == std::chrono::seconds::zero() ? default_ttl_ : ttl;
      const auto expires = std::chrono::time_point_cast<std::chrono::milliseconds>(
          std::chrono::system_clock::now() + effective_ttl).time_since_epoch().count();
      response->set_expires_at_unix_ms(static_cast<std::uint64_t>(expires));
      return grpc::Status::OK;
    } catch (const std::exception& error) {
      return {grpc::StatusCode::INTERNAL, error.what()};
    }
  }

  grpc::ServerReadReactor<UploadWorkspaceRequest>* UploadWorkspace(
      grpc::CallbackServerContext*, UploadWorkspaceResponse* response) override {
    return new UploadReactor(*this, response);
  }

  grpc::ServerUnaryReactor* DeleteWorkspace(
      grpc::CallbackServerContext*, const DeleteWorkspaceRequest* request,
      google::protobuf::Empty* response) override {
    auto owned_request = std::make_shared<DeleteWorkspaceRequest>(*request);
    return new UnaryTaskReactor<google::protobuf::Empty>(
        blocking_, callbacks_, response, [this, owned_request = std::move(owned_request)](
            const CancellationToken& cancelled, google::protobuf::Empty*) {
          if (cancelled.cancelled()) return grpc::Status(grpc::StatusCode::CANCELLED, "RPC cancelled");
          if (!store_->erase(owned_request->workspace_id())) return Invalid("workspace not found or leased");
          return grpc::Status::OK;
        });
  }

  grpc::ServerWriteReactor<ParseProgramEvent>* ParseProgram(
      grpc::CallbackServerContext*, const ParseProgramRequest* request) override {
    return new ParseReactor(*this, *request);
  }

 private:
  class UploadReactor final : public grpc::ServerReadReactor<UploadWorkspaceRequest> {
    struct State {
      explicit State(std::shared_ptr<ProgramWorkspaceStore> value)
          : store(std::move(value)) {}
      ~State() { if (leased) store->unpin(workspace_id); }
      std::shared_ptr<ProgramWorkspaceStore> store;
      bool leased = false;
      std::string workspace_id;
      std::unordered_map<std::string, std::vector<std::uint8_t>> pending;
      std::size_t pending_bytes = 0;
    };
    struct Result {
      Result() = default;
      Result(grpc::Status value, bool end)
          : status(std::move(value)), finish(end) {}
      grpc::Status status;
      bool finish = false;
      std::size_t bytes = 0;
      std::string file;
    };
   public:
    UploadReactor(ProgramServiceImpl& service, UploadWorkspaceResponse* response)
        : service_(service), response_(response),
          admitted_(service_.upload_admission_.acquire()), state_(std::make_shared<State>(service_.store_)),
          gate_(std::make_shared<LifetimeGate<UploadReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<UploadReactor>> weak_gate = gate_;
      registration_ = service_.callbacks_.register_callback([weak_gate] {
        if (auto gate = weak_gate.lock()) gate->invoke([](UploadReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_) finish({grpc::StatusCode::RESOURCE_EXHAUSTED, "workspace upload limit reached"});
      else StartRead(&request_);
    }
    void OnReadDone(bool ok) override { gate_->invoke([ok](UploadReactor& r) { r.read_done(ok); }); }
    void OnCancel() override {
      token_->cancel();
      gate_->invoke([](UploadReactor& r) { r.finish({grpc::StatusCode::CANCELLED, "upload cancelled"}); });
    }
    void OnDone() override {
      gate_->detach();
      registration_.reset();
      if (admitted_) service_.upload_admission_.release();
      delete this;
    }
    void shutdown() {
      token_->cancel();
      finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }
   private:
    void read_done(bool ok) {
      if (!ok) { finish(validate_end(*state_)); return; }
      auto message = request_; request_.Clear();
      const auto state = state_;
      const auto token = token_;
      const auto max_upload_bytes = service_.max_upload_bytes_;
      const std::weak_ptr<LifetimeGate<UploadReactor>> weak_gate = gate_;
      if (!service_.blocking_.submit([weak_gate, state, token, max_upload_bytes,
                                      message = std::move(message)]() mutable {
            Result result = consume(*state, message, *token, max_upload_bytes);
            auto gate = weak_gate.lock();
            if (gate) gate->invoke([&](UploadReactor& r) { r.consumed(std::move(result)); });
          })) finish({grpc::StatusCode::RESOURCE_EXHAUSTED, "filesystem work queue is full"});
    }
    static Result consume(State& state, const UploadWorkspaceRequest& request,
                          const CancellationToken& token,
                          std::size_t max_upload_bytes) {
      if (token.cancelled()) return {{grpc::StatusCode::CANCELLED, "upload cancelled"}, true};
      if (request.content_case() == UploadWorkspaceRequest::kFinish)
        return {validate_end(state), true};
      if (request.content_case() != UploadWorkspaceRequest::kFile)
        return {Invalid("file chunk required"), true};
      const auto& file = request.file();
      if (state.workspace_id.empty()) {
        state.workspace_id = request.workspace_id();
        if (state.workspace_id.empty() || !state.store->pin(state.workspace_id))
          return {Invalid("workspace not found"), true};
        state.leased = true;
      }
      if (request.workspace_id() != state.workspace_id)
        return {Invalid("all chunks must address one workspace"), true};
      if (file.data().size() > kMaxUploadChunk || file.relative_path().empty())
        return {Invalid("invalid or oversized file chunk"), true};
      if (file.data().size() > max_upload_bytes ||
          state.pending_bytes > max_upload_bytes - file.data().size())
        return {{grpc::StatusCode::RESOURCE_EXHAUSTED,
                 "workspace upload exceeds its bounded quota"}, true};
      auto& buffer = state.pending[file.relative_path()];
      state.pending_bytes += file.data().size();
      buffer.insert(buffer.end(), file.data().begin(), file.data().end());
      if (file.eof()) {
        if (!state.store->write_file(state.workspace_id, file.relative_path(), buffer))
          return {Invalid("workspace path or quota rejected"), true};
        Result result; result.bytes = buffer.size(); result.file = file.relative_path();
        state.pending_bytes -= buffer.size(); state.pending.erase(file.relative_path());
        return result;
      }
      return {};
    }
    static grpc::Status validate_end(const State& state) {
      if (!state.pending.empty()) return Invalid("workspace upload ended before file eof");
      if (state.workspace_id.empty()) return Invalid("workspace upload requires at least one file");
      return grpc::Status::OK;
    }
    void consumed(Result result) {
      if (result.bytes) response_->set_bytes_written(response_->bytes_written() + result.bytes);
      if (!result.file.empty()) response_->add_files(std::move(result.file));
      if (result.finish) finish(std::move(result.status));
      else StartRead(&request_);
    }
    void finish(grpc::Status status) {
      gate_->finish([&](UploadReactor& reactor) { reactor.Finish(status); });
    }
    ProgramServiceImpl& service_; UploadWorkspaceResponse* response_;
    bool admitted_ = false; UploadWorkspaceRequest request_;
    std::shared_ptr<State> state_;
    std::shared_ptr<CancellationToken> token_ = std::make_shared<CancellationToken>();
    std::shared_ptr<LifetimeGate<UploadReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };

  class ParseReactor final : public grpc::ServerWriteReactor<ParseProgramEvent> {
    struct State {
      std::mutex mutex;
      std::condition_variable condition;
      std::deque<ParseProgramEvent> batches;
      std::optional<ParseProgramEvent> progress;
      std::optional<ParseProgramEvent> terminal;
      grpc::Status terminal_status = grpc::Status::OK;
      bool done = false;
      bool cancelled = false;
    };

   public:
    ParseReactor(ProgramServiceImpl& service, ParseProgramRequest request)
        : service_(service), request_(std::move(request)),
          admitted_(service_.stream_admission_.acquire()),
          state_(std::make_shared<State>()),
          gate_(std::make_shared<LifetimeGate<ParseReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<ParseReactor>> weak_gate = gate_;
      registration_ = service_.callbacks_.register_callback([weak_gate] {
        if (auto gate = weak_gate.lock()) gate->invoke([](ParseReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_) {
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                "stream admission limit reached"});
        return;
      }
      start_parse();
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](ParseReactor& reactor) { reactor.write_done(ok); });
    }
    void OnCancel() override {
      gate_->invoke([](ParseReactor& reactor) { reactor.cancel(); });
    }
    void OnDone() override {
      {
        std::lock_guard lock(state_->mutex);
        state_->cancelled = true;
      }
      state_->condition.notify_all();
      gate_->detach();
      registration_.reset();
      if (admitted_) service_.stream_admission_.release();
      delete this;
    }

    void shutdown() {
      {
        std::lock_guard lock(state_->mutex);
        state_->cancelled = true;
        state_->terminal_status = {grpc::StatusCode::UNAVAILABLE,
                                   "server shutting down"};
      }
      state_->condition.notify_all();
      finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }

   private:
    void start_parse() {
      const auto state = state_;
      const auto request = request_;
      auto* service = &service_;
      const std::weak_ptr<LifetimeGate<ParseReactor>> weak_gate = gate_;
      if (!service_.parser_worker_.submit([service, state, request, weak_gate] {
            const auto wake = [weak_gate] {
              auto gate = weak_gate.lock();
              if (gate) gate->invoke([](ParseReactor& reactor) { reactor.pump(); });
            };
#ifdef LINUXCNC_GRPC_HAS_RS274
            const auto& handle = request.entry();
            std::filesystem::path source;
            bool leased = false;
            if (handle.workspace_id().empty() || handle.relative_path().empty() ||
                !service->store_->resolve_entry(handle.workspace_id(),
                                                handle.relative_path(), &source) ||
                !(leased = service->store_->pin(handle.workspace_id()))) {
              {
                std::lock_guard lock(state->mutex);
                state->terminal_status = Invalid("program workspace entry is missing or unsafe");
                state->done = true;
              }
              wake();
              return;
            }
            try {
              gcode::ParseOptions options;
              options.ini_path = service->ini_file_.string();
              options.batch_size = service->batch_size_;
              options.is_cancelled = [state] {
                std::lock_guard lock(state->mutex);
                return state->cancelled;
              };
              options.on_progress = [state, wake](const gcode::ParseProgress& progress) {
                ParseProgramEvent event;
                auto* encoded = event.mutable_progress();
                encoded->set_bytes_read(progress.bytesRead);
                encoded->set_total_bytes(progress.totalBytes);
                encoded->set_percent(static_cast<std::uint32_t>(
                    std::clamp(progress.percent, 0.0, 100.0)));
                encoded->set_operation_count(progress.operationCount);
                {
                  std::lock_guard lock(state->mutex);
                  if (state->cancelled) return;
                  state->progress = std::move(event);
                }
                wake();
              };
              options.on_batch = [state, wake](gcode::OperationBatch&& batch) {
                ParseProgramEvent event;
                auto* encoded = event.mutable_batch();
                for (const auto& operation : batch)
                  encode_gcode_operation(operation, encoded->add_operations());
                {
                  std::unique_lock lock(state->mutex);
                  state->condition.wait(lock, [state] {
                    return state->cancelled || state->batches.size() < 2;
                  });
                  if (state->cancelled) return false;
                  state->batches.push_back(std::move(event));
                }
                wake();
                return true;
              };
              const auto result = service->parser_.parse_file(source.string(), options);
              std::lock_guard lock(state->mutex);
              if (result.cancelled || state->cancelled) {
                state->terminal_status = {grpc::StatusCode::CANCELLED,
                                          "G-code parse cancelled"};
              } else {
                ParseProgramEvent final_event;
                auto* summary = final_event.mutable_summary();
                encode_gcode_extents(result.extents, summary->mutable_extents());
                summary->set_operation_count(result.operationCount);
                state->terminal = std::move(final_event);
              }
              state->done = true;
            } catch (const std::exception& error) {
              std::lock_guard lock(state->mutex);
              ParseProgramEvent event;
              event.mutable_error()->set_type(NML_MESSAGE_TYPE_NML_ERROR);
              event.mutable_error()->set_message(error.what());
              state->terminal = std::move(event);
              state->done = true;
            }
            if (leased) service->store_->unpin(handle.workspace_id());
#else
            {
              std::lock_guard lock(state->mutex);
              state->terminal_status = Unimplemented("rs274 parser adapter is not linked");
              state->done = true;
            }
#endif
            wake();
          })) {
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED, "parser queue is full"});
      }
    }

    void pump() {
      if (writing_ || gate_->state() != LifetimeGate<ParseReactor>::State::Open) return;
      grpc::Status done_status;
      bool done = false;
      {
        std::lock_guard lock(state_->mutex);
        if (!state_->batches.empty()) {
          message_ = std::move(state_->batches.front());
          state_->batches.pop_front();
          writing_batch_ = true;
        } else if (state_->progress) {
          message_ = std::move(*state_->progress);
          state_->progress.reset();
          writing_batch_ = false;
        } else if (state_->terminal) {
          message_ = std::move(*state_->terminal);
          state_->terminal.reset();
          writing_batch_ = false;
          terminal_write_ = true;
        } else if (state_->done) {
          done = true;
          done_status = state_->terminal_status;
        } else {
          return;
        }
      }
      state_->condition.notify_all();
      if (done) { finish(done_status); return; }
      writing_ = true;
      StartWrite(&message_);
    }
    void write_done(bool ok) {
      writing_ = false;
      if (!ok) { cancel(); return; }
      if (terminal_write_) {
        terminal_write_ = false;
        finish(grpc::Status::OK);
        return;
      }
      writing_batch_ = false;
      pump();
    }
    void cancel() {
      {
        std::lock_guard lock(state_->mutex);
        state_->cancelled = true;
      }
      state_->condition.notify_all();
      finish({grpc::StatusCode::CANCELLED, "G-code parse cancelled"});
    }
    void finish(grpc::Status status) {
      gate_->finish([&](ParseReactor& reactor) { reactor.Finish(status); });
    }

    ProgramServiceImpl& service_;
    ParseProgramRequest request_;
    bool admitted_ = false;
    bool writing_ = false;
    bool writing_batch_ = false;
    bool terminal_write_ = false;
    ParseProgramEvent message_;
    std::shared_ptr<State> state_;
    std::shared_ptr<LifetimeGate<ParseReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };

  std::shared_ptr<ProgramWorkspaceStore> store_;
  BoundedExecutor& blocking_;
  BoundedExecutor& parser_worker_;
  AdmissionCounter& upload_admission_;
  AdmissionCounter& stream_admission_;
  const std::filesystem::path ini_file_;
  const std::size_t batch_size_;
#ifdef LINUXCNC_GRPC_HAS_RS274
  gcode::SerializedRs274Parser parser_;
#endif
  const std::chrono::seconds default_ttl_;
  const std::size_t max_upload_bytes_;
  const std::chrono::seconds prune_period_;
  std::mutex prune_mutex_;
  std::condition_variable prune_condition_;
  std::atomic<bool> stopping_;
  std::thread pruner_;
  ActiveCallbackRegistry callbacks_;
};

#ifndef LINUXCNC_GRPC_HAS_HAL
std::optional<HalValue> decode_hal_value(const HalScalar& scalar) {
  switch (scalar.type()) {
    case HAL_TYPE_BIT: if (scalar.value_case() == HalScalar::kBit) return scalar.bit(); break;
    case HAL_TYPE_FLOAT: if (scalar.value_case() == HalScalar::kFloatValue) return scalar.float_value(); break;
    case HAL_TYPE_S32: if (scalar.value_case() == HalScalar::kS32) return scalar.s32(); break;
    case HAL_TYPE_U32: if (scalar.value_case() == HalScalar::kU32) return scalar.u32(); break;
    case HAL_TYPE_S64: if (scalar.value_case() == HalScalar::kS64) return scalar.s64(); break;
    case HAL_TYPE_U64: if (scalar.value_case() == HalScalar::kU64) return scalar.u64(); break;
    default: break;
  }
  return std::nullopt;
}

void encode_hal_value(const HalValue& value, HalScalar* scalar) {
  if (const auto* item = std::get_if<bool>(&value)) { scalar->set_type(HAL_TYPE_BIT); scalar->set_bit(*item); }
  else if (const auto* item = std::get_if<double>(&value)) { scalar->set_type(HAL_TYPE_FLOAT); scalar->set_float_value(*item); }
  else if (const auto* item = std::get_if<std::int32_t>(&value)) { scalar->set_type(HAL_TYPE_S32); scalar->set_s32(*item); }
  else if (const auto* item = std::get_if<std::uint32_t>(&value)) { scalar->set_type(HAL_TYPE_U32); scalar->set_u32(*item); }
  else if (const auto* item = std::get_if<std::int64_t>(&value)) { scalar->set_type(HAL_TYPE_S64); scalar->set_s64(*item); }
  else if (const auto* item = std::get_if<std::uint64_t>(&value)) { scalar->set_type(HAL_TYPE_U64); scalar->set_u64(*item); }
}

HalValue default_hal_value(HalType type) {
  switch (type) {
    case HAL_TYPE_BIT: return false;
    case HAL_TYPE_FLOAT: return 0.0;
    case HAL_TYPE_S32: return std::int32_t{0};
    case HAL_TYPE_U32: return std::uint32_t{0};
    case HAL_TYPE_S64: return std::int64_t{0};
    case HAL_TYPE_U64: return std::uint64_t{0};
    default: return false;
  }
}
#endif

#ifdef LINUXCNC_GRPC_HAS_HAL

grpc::Status hal_error(const HalAdapterError& error) {
  const auto code = error.code() == -ENOENT ? grpc::StatusCode::NOT_FOUND
      : error.code() == -EBUSY ? grpc::StatusCode::RESOURCE_EXHAUSTED
      : error.code() == -EINVAL ? grpc::StatusCode::INVALID_ARGUMENT
                                : grpc::StatusCode::FAILED_PRECONDITION;
  return {code, error.what()};
}

std::optional<HalAdapterType> decode_hal_type(HalType type) {
  if (type < HAL_TYPE_BIT || type > HAL_TYPE_U64) return std::nullopt;
  return static_cast<HalAdapterType>(static_cast<int>(type) - 1);
}
#endif

using HalUnaryCallbackBase = HalService::CallbackService;

class HalUnaryService : public HalUnaryCallbackBase {
 public:
  explicit HalUnaryService(BoundedExecutor& worker) : worker_(worker) {}
  grpc::ServerUnaryReactor* GetTopology(grpc::CallbackServerContext*, const GetHalTopologyRequest* q, GetHalTopologyResponse* r) override { return task(q, r, &HalUnaryService::do_get_topology); }
  grpc::ServerUnaryReactor* Read(grpc::CallbackServerContext*, const HalReadRequest* q, HalReadResponse* r) override { return task(q, r, &HalUnaryService::do_read); }
  grpc::ServerUnaryReactor* Write(grpc::CallbackServerContext*, const HalWrite* q, HalWriteResponse* r) override { return task(q, r, &HalUnaryService::do_write); }
  grpc::ServerUnaryReactor* CreateSignal(grpc::CallbackServerContext*, const CreateHalSignalRequest* q, CreateHalSignalResponse* r) override { return task(q, r, &HalUnaryService::do_create_signal); }
  grpc::ServerUnaryReactor* SetMessageLevel(grpc::CallbackServerContext*, const SetHalMessageLevelRequest* q, google::protobuf::Empty* r) override { return task(q, r, &HalUnaryService::do_set_message_level); }
  grpc::ServerUnaryReactor* GetWriterMetadata(grpc::CallbackServerContext*, const GetHalWriterMetadataRequest* q, GetHalWriterMetadataResponse* r) override { return task(q, r, &HalUnaryService::do_get_writer_metadata); }
  grpc::ServerUnaryReactor* SetWriterReady(grpc::CallbackServerContext*, const SetHalWriterReadyRequest* q, google::protobuf::Empty* r) override { return task(q, r, &HalUnaryService::do_set_writer_ready); }
 protected:
  ActiveCallbackRegistry& callback_registry() { return callbacks_; }
  void shutdown_callbacks() { callbacks_.shutdown(); }
  virtual grpc::Status do_get_topology(const GetHalTopologyRequest*, GetHalTopologyResponse*) = 0;
  virtual grpc::Status do_read(const HalReadRequest*, HalReadResponse*) = 0;
  virtual grpc::Status do_write(const HalWrite*, HalWriteResponse*) = 0;
  virtual grpc::Status do_create_signal(const CreateHalSignalRequest*, CreateHalSignalResponse*) = 0;
  virtual grpc::Status do_set_message_level(const SetHalMessageLevelRequest*, google::protobuf::Empty*) = 0;
  virtual grpc::Status do_get_writer_metadata(const GetHalWriterMetadataRequest*, GetHalWriterMetadataResponse*) = 0;
  virtual grpc::Status do_set_writer_ready(const SetHalWriterReadyRequest*, google::protobuf::Empty*) = 0;
 private:
  template <typename Request, typename Response>
  grpc::ServerUnaryReactor* task(const Request* request, Response* response,
      grpc::Status (HalUnaryService::*method)(const Request*, Response*)) {
    auto owned_request = std::make_shared<Request>(*request);
    return new UnaryTaskReactor<Response>(worker_, callbacks_, response,
        [this, owned_request = std::move(owned_request), method](
            const CancellationToken& token, Response* task_response) {
      if (token.cancelled()) return grpc::Status(grpc::StatusCode::CANCELLED, "RPC cancelled");
      return (this->*method)(owned_request.get(), task_response);
    });
  }
  BoundedExecutor& worker_;
  ActiveCallbackRegistry callbacks_;
};

#ifdef LINUXCNC_GRPC_HAS_HAL
class HalServiceImpl final : public HalUnaryService {
  class TopologyReactor;
  class ComponentReactor;

 public:
  HalServiceImpl(const DaemonConfig& config, BoundedExecutor& worker,
                 AdmissionCounter& component_admission,
                 AdmissionCounter& stream_admission)
      : HalUnaryService(worker), worker_(worker),
        component_admission_(component_admission),
        stream_admission_(stream_admission),
        topology_period_(config.topology_period),
        timer_([this] { timer_loop(); }) {}

  ~HalServiceImpl() override { begin_shutdown(); }

  void begin_shutdown() {
    if (stopping_.exchange(true)) return;
    topology_wakes_.close();
    shutdown_callbacks();
    timer_condition_.notify_all();
    if (timer_.joinable()) timer_.join();
  }

  grpc::Status do_get_topology(const GetHalTopologyRequest*,
                           GetHalTopologyResponse* response) override {
    try {
      auto [sequence, topology] = topology_snapshot();
      response->set_sequence(sequence);
      *response->mutable_topology() = std::move(topology);
      return grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  grpc::ServerWriteReactor<WatchHalTopologyEvent>* WatchTopology(
      grpc::CallbackServerContext*, const WatchHalTopologyRequest* request) override {
    return new TopologyReactor(*this, request->after_sequence());
  }

  grpc::Status do_read(const HalReadRequest* request,
                    HalReadResponse* response) override {
    try {
      std::vector<HalAdapterReference> references;
      references.reserve(request->items_size());
      for (const auto& item : request->items()) {
        auto decoded = decode_hal_reference(item);
        if (!decoded) return Invalid("HAL read contains an invalid item reference");
        references.push_back(std::move(*decoded));
      }
      const auto values = adapter_.read_many(references);
      for (std::size_t index = 0; index < values.size(); ++index) {
        if (!values[index]) {
          return {grpc::StatusCode::NOT_FOUND,
                  "HAL item '" + references[index].name + "' was not found"};
        }
        auto* encoded = response->add_values();
        *encoded->mutable_item() = request->items(static_cast<int>(index));
        encode_hal_scalar(*values[index], encoded->mutable_value());
      }
      return grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  grpc::Status do_write(const HalWrite* request,
                     HalWriteResponse* response) override {
    try {
      for (const auto& write : request->writes()) {
        auto reference = decode_hal_reference(write.item());
        auto value = decode_hal_scalar(write.value());
        if (!reference || !value) {
          return Invalid("HAL write contains a mismatched reference or scalar oneof");
        }
        HalAdapterValue written;
        if (!adapter_.write(*reference, *value, &written)) {
          return {grpc::StatusCode::FAILED_PRECONDITION,
                  "HAL item '" + reference->name + "' is missing, mistyped, or not writable"};
        }
        auto* encoded = response->add_values();
        *encoded->mutable_item() = write.item();
        encode_hal_scalar(written, encoded->mutable_value());
      }
      return grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  grpc::Status do_create_signal(const CreateHalSignalRequest* request,
                            CreateHalSignalResponse* response) override {
    const auto type = decode_hal_type(request->type());
    if (request->name().empty() || !type) return Invalid("signal name and type are required");
    try {
      if (!adapter_.create_signal(request->name(), *type)) {
        return Invalid("HAL signal was rejected");
      }
      const auto topology = adapter_.topology();
      const auto found = std::find_if(topology.signals.begin(), topology.signals.end(),
                                     [&](const auto& signal) {
                                       return signal.name == request->name();
                                     });
      if (found == topology.signals.end()) {
        return {grpc::StatusCode::INTERNAL, "created HAL signal is not visible"};
      }
      HalAdapterTopology one;
      one.signals.push_back(*found);
      linuxcnc::v1::HalTopology encoded;
      encode_hal_topology(one, &encoded);
      *response->mutable_signal() = encoded.signals(0);
      return grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  grpc::Status do_set_message_level(
                               const SetHalMessageLevelRequest* request,
                               google::protobuf::Empty*) override {
    if (request->level() < RTAPI_MESSAGE_LEVEL_NONE ||
        request->level() > RTAPI_MESSAGE_LEVEL_ALL) {
      return Invalid("HAL message level is required");
    }
    try {
      adapter_.set_message_level(static_cast<int>(request->level()) - 1);
      return grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  grpc::Status do_get_writer_metadata(const GetHalWriterMetadataRequest*,
                                 GetHalWriterMetadataResponse* response) override {
    response->mutable_metadata()->set_writer_id("linuxcnc-grpc-server");
    response->mutable_metadata()->set_ready(writer_ready_.load(std::memory_order_relaxed));
    return grpc::Status::OK;
  }

  grpc::Status do_set_writer_ready(const SetHalWriterReadyRequest* request,
                              google::protobuf::Empty*) override {
    writer_ready_.store(request->ready(), std::memory_order_relaxed);
    return grpc::Status::OK;
  }

  grpc::ServerBidiReactor<ComponentSessionMessage, ComponentSessionMessage>*
  ComponentSession(grpc::CallbackServerContext*) override {
    return new ComponentReactor(*this);
  }

 private:
  struct ComponentState {
    struct Item {
      std::string suffix;
      HalItemKind kind = HAL_ITEM_KIND_PIN;
      std::string full_name;
      std::optional<HalAdapterValue> previous;
    };
    std::unique_ptr<LinuxCncHalComponent> component;
    std::vector<Item> items;
    std::uint64_t sequence = 0;
    bool ready = false;
    std::atomic<bool> cleanup_started{false};
  };

  class TopologyReactor final
      : public grpc::ServerWriteReactor<WatchHalTopologyEvent> {
   public:
    TopologyReactor(HalServiceImpl& service, std::uint64_t after)
        : service_(service), after_(after),
          admitted_(service_.stream_admission_.acquire()),
          gate_(std::make_shared<LifetimeGate<TopologyReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<TopologyReactor>> weak = gate_;
      registration_ = service_.callback_registry().register_callback([weak] {
        if (auto gate = weak.lock()) gate->invoke([](TopologyReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_) {
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                "stream admission limit reached"});
        return;
      }
      subscription_ = service_.topology_wakes_.subscribe([weak](const std::uint64_t&) {
        if (auto gate = weak.lock())
          gate->invoke([](TopologyReactor& reactor) { reactor.schedule(); });
      });
      schedule();
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](TopologyReactor& reactor) {
        reactor.writing_ = false;
        if (!ok) reactor.finish(grpc::Status::OK);
        else { reactor.after_ = reactor.writing_sequence_; reactor.schedule(); }
      });
    }
    void OnCancel() override {
      gate_->invoke([](TopologyReactor& reactor) {
        reactor.finish({grpc::StatusCode::CANCELLED, "topology stream cancelled"});
      });
    }
    void OnDone() override {
      subscription_.reset();
      gate_->detach();
      registration_.reset();
      if (admitted_) service_.stream_admission_.release();
      delete this;
    }
    void shutdown() {
      subscription_.reset();
      finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }
   private:
    void schedule() {
      if (writing_ || scheduled_ ||
          gate_->state() != LifetimeGate<TopologyReactor>::State::Open) return;
      scheduled_ = true;
      const std::weak_ptr<LifetimeGate<TopologyReactor>> weak = gate_;
      if (!service_.worker_.submit([weak, service = &service_] {
            grpc::Status status;
            std::uint64_t sequence = 0;
            linuxcnc::v1::HalTopology topology;
            try {
              auto snapshot = service->topology_snapshot();
              sequence = snapshot.first;
              topology = std::move(snapshot.second);
            } catch (const HalAdapterError& error) { status = hal_error(error); }
            if (auto gate = weak.lock()) gate->invoke(
                [&](TopologyReactor& reactor) {
                  reactor.scheduled_ = false;
                  if (!status.ok()) { reactor.finish(status); return; }
                  if (sequence <= reactor.after_) return;
                  reactor.message_.Clear();
                  reactor.message_.set_sequence(sequence);
                  *reactor.message_.mutable_topology() = std::move(topology);
                  reactor.writing_sequence_ = sequence;
                  reactor.writing_ = true;
                  reactor.StartWrite(&reactor.message_);
                });
          })) {
        scheduled_ = false;
        finish(service_.worker_.accepting()
                   ? grpc::Status(grpc::StatusCode::RESOURCE_EXHAUSTED,
                                  "HAL runtime queue is full")
                   : grpc::Status(grpc::StatusCode::UNAVAILABLE,
                                  "server shutting down"));
      }
    }
    void finish(grpc::Status status) {
      gate_->finish([&](TopologyReactor& reactor) {
        reactor.subscription_.reset(); reactor.Finish(status);
      });
    }
    HalServiceImpl& service_;
    std::uint64_t after_ = 0, writing_sequence_ = 0;
    bool admitted_ = false, writing_ = false, scheduled_ = false;
    WatchHalTopologyEvent message_;
    SubscriptionHub<std::uint64_t>::Subscription subscription_;
    std::shared_ptr<LifetimeGate<TopologyReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };

  class ComponentReactor final
      : public grpc::ServerBidiReactor<ComponentSessionMessage,
                                       ComponentSessionMessage> {
   public:
    explicit ComponentReactor(HalServiceImpl& service)
        : service_(service), admitted_(service_.component_admission_.acquire()),
          stream_admitted_(service_.stream_admission_.acquire()),
          state_(std::make_shared<ComponentState>()),
          gate_(std::make_shared<LifetimeGate<ComponentReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<ComponentReactor>> weak = gate_;
      registration_ = service_.callback_registry().register_callback([weak] {
        if (auto gate = weak.lock()) gate->invoke([](ComponentReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_ || !stream_admitted_) {
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                "component or stream admission limit reached"});
        return;
      }
      service_.register_component(state_, gate_);
      StartRead(&request_);
    }
    void OnReadDone(bool ok) override {
      gate_->invoke([ok](ComponentReactor& reactor) { reactor.read_done(ok); });
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](ComponentReactor& reactor) {
        reactor.writing_ = false;
        if (!ok) { reactor.finish(grpc::Status::OK); return; }
        if (reactor.pending_delta_) {
          reactor.response_ = std::move(*reactor.pending_delta_);
          reactor.pending_delta_.reset();
          reactor.writing_ = true;
          reactor.StartWrite(&reactor.response_);
        } else if (reactor.read_paused_) {
          reactor.read_paused_ = false;
          reactor.StartRead(&reactor.request_);
        }
      });
    }
    void OnCancel() override {
      gate_->invoke([](ComponentReactor& reactor) {
        reactor.finish({grpc::StatusCode::CANCELLED, "component session cancelled"});
      });
    }
    void OnDone() override {
      gate_->detach();
      registration_.reset();
      request_cleanup();
      if (stream_admitted_) service_.stream_admission_.release();
      delete this;
    }
    void shutdown() {
      request_cleanup();
      finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }
    void offer_delta(ComponentSessionMessage message) {
      if (writing_) { pending_delta_ = std::move(message); return; }
      response_ = std::move(message); writing_ = true; StartWrite(&response_);
    }
   private:
    void read_done(bool ok) {
      if (!ok) { finish(grpc::Status::OK); return; }
      auto request = request_; request_.Clear(); read_paused_ = true;
      const auto state = state_;
      const std::weak_ptr<LifetimeGate<ComponentReactor>> weak = gate_;
      if (!service_.worker_.submit([service = &service_, state, weak,
                                    request = std::move(request)]() mutable {
            grpc::Status status;
            std::optional<ComponentSessionMessage> response;
            bool close = false;
            try {
              service->consume_component(*state, request, &response, &close);
            } catch (const HalAdapterError& error) { status = hal_error(error); }
            if (auto gate = weak.lock()) gate->invoke([&](ComponentReactor& reactor) {
              if (!status.ok()) { reactor.finish(status); return; }
              if (close) { reactor.finish(grpc::Status::OK); return; }
              if (response) {
                reactor.read_paused_ = true;
                reactor.offer_delta(std::move(*response));
              } else {
                reactor.read_paused_ = false;
                reactor.StartRead(&reactor.request_);
              }
            });
          })) {
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED, "HAL runtime queue is full"});
      }
    }
    void request_cleanup() {
      if (!admitted_ || state_->cleanup_started.exchange(true)) return;
      const auto state = state_;
      auto* admission = &service_.component_admission_;
      if (!service_.worker_.submit_cleanup([state, admission] {
            state->component.reset(); admission->release();
          })) {
        // The reserve is sized for every admitted component. Failure here is
        // a shutdown invariant violation, so perform the idempotent cleanup
        // synchronously instead of leaking the native HAL component.
        state->component.reset(); admission->release();
      }
    }
    void finish(grpc::Status status) {
      gate_->finish([&](ComponentReactor& reactor) {
        reactor.request_cleanup(); reactor.Finish(status);
      });
    }
    HalServiceImpl& service_;
    bool admitted_ = false, stream_admitted_ = false;
    bool writing_ = false, read_paused_ = false;
    ComponentSessionMessage request_, response_;
    std::optional<ComponentSessionMessage> pending_delta_;
    std::shared_ptr<ComponentState> state_;
    std::shared_ptr<LifetimeGate<ComponentReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };

  void register_component(
      const std::shared_ptr<ComponentState>& state,
      const std::shared_ptr<LifetimeGate<ComponentReactor>>& gate) {
    std::lock_guard lock(components_mutex_);
    components_.push_back({state, gate});
  }

  void consume_component(ComponentState& state,
                         const ComponentSessionMessage& request,
                         std::optional<ComponentSessionMessage>* response,
                         bool* close) {
    switch (request.message_case()) {
      case ComponentSessionMessage::kOpen: {
        if (state.component) throw HalAdapterError("component is already open", -EBUSY);
        state.component = adapter_.open_component(request.open().name(), request.open().prefix());
        ComponentSessionMessage message;
        message.mutable_metadata()->set_writer_id(state.component->name());
        message.mutable_metadata()->set_ready(false);
        *response = std::move(message);
        return;
      }
      case ComponentSessionMessage::kPin: {
        if (!state.component) throw HalAdapterError("open a component before creating pins", -EINVAL);
        const auto type = decode_hal_type(request.pin().type());
        if (!type) throw HalAdapterError("invalid component pin type", -EINVAL);
        HalAdapterPinDirection direction;
        switch (request.pin().direction()) {
          case HAL_PIN_DIRECTION_IN: direction = HalAdapterPinDirection::In; break;
          case HAL_PIN_DIRECTION_OUT: direction = HalAdapterPinDirection::Out; break;
          case HAL_PIN_DIRECTION_IO: direction = HalAdapterPinDirection::Io; break;
          default: throw HalAdapterError("invalid component pin direction", -EINVAL);
        }
        if (!state.component->add_pin(request.pin().name(), *type, direction))
          throw HalAdapterError("component pin was rejected", -EINVAL);
        state.items.push_back({request.pin().name(), HAL_ITEM_KIND_PIN,
            state.component->prefix() + "." + request.pin().name(), std::nullopt});
        return;
      }
      case ComponentSessionMessage::kParameter: {
        if (!state.component) throw HalAdapterError("open a component before creating parameters", -EINVAL);
        const auto type = decode_hal_type(request.parameter().type());
        if (!type) throw HalAdapterError("invalid component parameter type", -EINVAL);
        HalAdapterParamDirection direction;
        switch (request.parameter().direction()) {
          case HAL_PARAM_DIRECTION_RO: direction = HalAdapterParamDirection::ReadOnly; break;
          case HAL_PARAM_DIRECTION_RW: direction = HalAdapterParamDirection::ReadWrite; break;
          default: throw HalAdapterError("invalid component parameter direction", -EINVAL);
        }
        if (!state.component->add_param(request.parameter().name(), *type, direction))
          throw HalAdapterError("component parameter was rejected", -EINVAL);
        state.items.push_back({request.parameter().name(), HAL_ITEM_KIND_PARAM,
            state.component->prefix() + "." + request.parameter().name(), std::nullopt});
        return;
      }
      case ComponentSessionMessage::kReady: {
        if (!state.component) throw HalAdapterError("component is not open", -EINVAL);
        if (request.ready().ready()) state.component->set_ready();
        else state.component->set_unready();
        state.ready = request.ready().ready();
        ComponentSessionMessage message;
        message.mutable_metadata()->set_writer_id(state.component->name());
        message.mutable_metadata()->set_ready(state.component->ready());
        *response = std::move(message);
        return;
      }
      case ComponentSessionMessage::kValue: {
        if (!state.component) throw HalAdapterError("component is not open", -EINVAL);
        auto value = decode_hal_scalar(request.value().value());
        if (!value) throw HalAdapterError("component value oneof is invalid", -EINVAL);
        auto name = request.value().item().name();
        const auto prefix = state.component->prefix() + ".";
        if (name.rfind(prefix, 0) == 0) name.erase(0, prefix.size());
        if (!state.component->write(name, *value))
          throw HalAdapterError("component value was rejected", -EINVAL);
        return;
      }
      case ComponentSessionMessage::kClose: *close = true; return;
      default: throw HalAdapterError("client sent an invalid component session message", -EINVAL);
    }
  }

  void sample_components() {
    std::vector<ComponentRegistration> registrations;
    {
      std::lock_guard lock(components_mutex_);
      components_.erase(std::remove_if(components_.begin(), components_.end(),
          [](const ComponentRegistration& item) {
            return item.state.expired() || item.gate.expired();
          }), components_.end());
      registrations = components_;
    }
    for (const auto& registration : registrations) {
      auto state = registration.state.lock();
      if (!state || !state->component || !state->ready || state->cleanup_started.load()) continue;
      ComponentSessionMessage message;
      auto* delta = message.mutable_delta();
      for (auto& item : state->items) {
        const auto value = state->component->read(item.suffix);
        if (!value || (item.previous && *item.previous == *value)) continue;
        item.previous = value;
        auto* encoded = delta->add_values();
        encoded->mutable_item()->set_kind(item.kind);
        encoded->mutable_item()->set_name(item.full_name);
        encode_hal_scalar(*value, encoded->mutable_value());
      }
      if (delta->values_size() == 0) continue;
      delta->set_sequence(++state->sequence);
      if (auto gate = registration.gate.lock())
        gate->invoke([message = std::move(message)](ComponentReactor& reactor) mutable {
          reactor.offer_delta(std::move(message));
        });
    }
  }

  void timer_loop() {
    auto next_topology = std::chrono::steady_clock::now();
    while (!stopping_.load()) {
      const auto now = std::chrono::steady_clock::now();
      const bool refresh_topology = now >= next_topology;
      if (refresh_topology) next_topology = now + topology_period_;
      worker_.submit([this, refresh_topology] {
        sample_components();
        if (!refresh_topology) return;
        try {
          const auto snapshot = topology_snapshot();
          if (snapshot.first > last_published_topology_) {
            last_published_topology_ = snapshot.first;
            topology_wakes_.publish(snapshot.first);
          }
        } catch (const HalAdapterError&) {}
      });
      std::unique_lock lock(timer_mutex_);
      timer_condition_.wait_for(lock, std::chrono::milliseconds(50),
                                [this] { return stopping_.load(); });
    }
  }

  std::pair<std::uint64_t, linuxcnc::v1::HalTopology> topology_snapshot() {
    linuxcnc::v1::HalTopology current;
    encode_hal_topology(adapter_.topology(), &current);
    auto structural = current;
    for (auto& pin : *structural.mutable_pins()) pin.clear_value();
    for (auto& parameter : *structural.mutable_params()) parameter.clear_value();
    for (auto& signal : *structural.mutable_signals()) signal.clear_value();
    const auto serialized = structural.SerializeAsString();
    std::lock_guard lock(topology_mutex_);
    if (topology_sequence_ == 0 || serialized != topology_serialized_) {
      ++topology_sequence_;
      topology_serialized_ = serialized;
    }
    return {topology_sequence_, std::move(current)};
  }

  LinuxCncHalAdapter adapter_;
  struct ComponentRegistration {
    std::weak_ptr<ComponentState> state;
    std::weak_ptr<LifetimeGate<ComponentReactor>> gate;
  };
  BoundedExecutor& worker_;
  AdmissionCounter& component_admission_;
  AdmissionCounter& stream_admission_;
  const std::chrono::milliseconds topology_period_;
  SubscriptionHub<std::uint64_t> topology_wakes_;
  std::mutex components_mutex_;
  std::vector<ComponentRegistration> components_;
  std::mutex topology_mutex_;
  std::string topology_serialized_;
  std::uint64_t topology_sequence_ = 0;
  std::uint64_t last_published_topology_ = 0;
  std::atomic<bool> writer_ready_{true};
  std::atomic<bool> stopping_{false};
  std::mutex timer_mutex_;
  std::condition_variable timer_condition_;
  std::thread timer_;
};

#else

class HalServiceImpl final : public HalUnaryService {
 public:
  HalServiceImpl(const DaemonConfig&, BoundedExecutor& worker,
                 AdmissionCounter& component_admission,
                 AdmissionCounter& stream_admission)
      : HalUnaryService(worker), worker_(worker),
        component_admission_(component_admission),
        stream_admission_(stream_admission) {}

  void begin_shutdown() {
    topology_wakes_.close();
    shutdown_callbacks();
  }

  grpc::ServerWriteReactor<WatchHalTopologyEvent>* WatchTopology(
      grpc::CallbackServerContext*, const WatchHalTopologyRequest* request) override {
    return new TopologyReactor(*this, request->after_sequence());
  }

  grpc::Status do_get_topology(const GetHalTopologyRequest*,
                           GetHalTopologyResponse* response) override {
    const auto topology = repository_.topology();
    response->set_sequence(topology.generation);
    for (const auto& item : topology.items) {
      auto* pin = item.pin ? response->mutable_topology()->add_pins() : nullptr;
      auto* param = item.pin ? nullptr : response->mutable_topology()->add_params();
      auto* scalar = item.pin ? pin->mutable_value() : param->mutable_value();
      encode_hal_value(item.value, scalar);
      if (item.pin) {
        pin->set_name(item.name);
        pin->set_type(static_cast<HalType>(scalar->type()));
      } else {
        param->set_name(item.name);
        param->set_type(static_cast<HalType>(scalar->type()));
      }
    }
    return grpc::Status::OK;
  }

  grpc::Status do_read(const HalReadRequest* request,
                    HalReadResponse* response) override {
    std::vector<std::string> names;
    names.reserve(request->items_size());
    for (const auto& item : request->items()) names.push_back(item.name());
    for (const auto& item : repository_.read_many(names)) {
      auto* value = response->add_values();
      value->mutable_item()->set_name(item.name);
      value->mutable_item()->set_kind(HAL_ITEM_KIND_PIN);
      encode_hal_value(item.value, value->mutable_value());
    }
    return grpc::Status::OK;
  }

  grpc::Status do_write(const HalWrite* request,
                     HalWriteResponse* response) override {
    std::vector<HalUpdate> updates;
    updates.reserve(request->writes_size());
    for (const auto& write : request->writes()) {
      auto value = decode_hal_value(write.value());
      if (!value) return Invalid("HAL value type does not match its oneof");
      updates.push_back(HalUpdate{write.item().name(), *value});
    }
    if (repository_.write_many(updates) != updates.size()) {
      return Invalid("one or more HAL values are unknown, read-only, or mistyped");
    }
    topology_wakes_.publish(repository_.generation());
    for (const auto& update : repository_.read_many([&] {
      std::vector<std::string> names;
      for (const auto& item : updates) names.push_back(item.name);
      return names;
    }())) {
      auto* value = response->add_values();
      value->mutable_item()->set_name(update.name);
      encode_hal_value(update.value, value->mutable_value());
    }
    return grpc::Status::OK;
  }

  grpc::Status do_create_signal(const CreateHalSignalRequest* request,
                            CreateHalSignalResponse* response) override {
    if (request->name().empty()) return Invalid("signal name is required");
    const auto type = static_cast<HalType>(request->type());
    HalItem item{request->name(), static_cast<HalScalarType>(type - HAL_TYPE_BIT), false, true,
                 default_hal_value(type)};
    if (!repository_.add_item(item)) return Invalid("signal already exists or has invalid type");
    topology_wakes_.publish(repository_.generation());
    auto* signal = response->mutable_signal();
    signal->set_name(item.name);
    signal->set_type(type);
    encode_hal_value(item.value, signal->mutable_value());
    return grpc::Status::OK;
  }

  grpc::Status do_set_message_level(const SetHalMessageLevelRequest*,
                               google::protobuf::Empty*) override {
    return Unimplemented("HAL message-level adapter is not linked");
  }

  grpc::Status do_get_writer_metadata(const GetHalWriterMetadataRequest*,
                                 GetHalWriterMetadataResponse* response) override {
    response->mutable_metadata()->set_writer_id(writer_id_);
    response->mutable_metadata()->set_ready(ready_);
    return grpc::Status::OK;
  }

  grpc::Status do_set_writer_ready(const SetHalWriterReadyRequest* request,
                              google::protobuf::Empty*) override {
    (void)request;
    return Unimplemented("HAL writer-ready adapter is not linked");
  }

  grpc::ServerBidiReactor<ComponentSessionMessage, ComponentSessionMessage>*
  ComponentSession(grpc::CallbackServerContext*) override {
    return new ComponentReactor(*this);
  }

 private:
  class TopologyReactor final
      : public grpc::ServerWriteReactor<WatchHalTopologyEvent> {
   public:
    TopologyReactor(HalServiceImpl& service, std::uint64_t after)
        : service_(service), admitted_(service_.stream_admission_.acquire()),
          sequence_(after),
          gate_(std::make_shared<LifetimeGate<TopologyReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<TopologyReactor>> weak = gate_;
      registration_ = service_.callback_registry().register_callback([weak] {
        if (auto gate = weak.lock()) gate->invoke([](TopologyReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_) { finish({grpc::StatusCode::RESOURCE_EXHAUSTED, "stream admission limit reached"}); return; }
      subscription_ = service_.topology_wakes_.subscribe([weak](const std::uint64_t&) {
        auto gate = weak.lock(); if (gate) gate->invoke([](TopologyReactor& r) { r.schedule(); });
      });
      schedule();
    }
    void OnWriteDone(bool ok) override { gate_->invoke([ok](TopologyReactor& r) { r.writing_ = false; if (!ok) r.finish(grpc::Status::OK); else r.schedule(); }); }
    void OnCancel() override { gate_->invoke([](TopologyReactor& r) { r.finish({grpc::StatusCode::CANCELLED, "topology stream cancelled"}); }); }
    void OnDone() override { subscription_.reset(); gate_->detach(); registration_.reset(); if (admitted_) service_.stream_admission_.release(); delete this; }
    void shutdown() { subscription_.reset(); finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"}); }
   private:
    void schedule() {
      if (writing_ || gate_->state() != LifetimeGate<TopologyReactor>::State::Open ||
          scheduled_.exchange(true)) return;
      const std::weak_ptr<LifetimeGate<TopologyReactor>> weak = gate_;
      if (!service_.worker_.submit([weak] { auto gate = weak.lock(); if (gate) gate->invoke([](TopologyReactor& r) { r.scheduled_ = false; r.emit(); }); })) {
        scheduled_ = false;
        finish(service_.worker_.accepting()
                   ? grpc::Status(grpc::StatusCode::RESOURCE_EXHAUSTED,
                                  "HAL work queue is full")
                   : grpc::Status(grpc::StatusCode::UNAVAILABLE,
                                  "server shutting down"));
      }
    }
    void emit() {
      const auto topology = service_.repository_.topology();
      if (topology.generation <= sequence_) return;
      message_.Clear(); message_.set_sequence(topology.generation);
      for (const auto& item : topology.items) {
        auto* pin = item.pin ? message_.mutable_topology()->add_pins() : nullptr;
        auto* param = item.pin ? nullptr : message_.mutable_topology()->add_params();
        auto* scalar = item.pin ? pin->mutable_value() : param->mutable_value();
        encode_hal_value(item.value, scalar);
        if (item.pin) { pin->set_name(item.name); pin->set_type(static_cast<HalType>(scalar->type())); }
        else { param->set_name(item.name); param->set_type(static_cast<HalType>(scalar->type())); }
      }
      sequence_ = topology.generation; writing_ = true; StartWrite(&message_);
    }
    void finish(grpc::Status status) {
      gate_->finish([&](TopologyReactor& reactor) {
        reactor.subscription_.reset();
        reactor.Finish(status);
      });
    }
    HalServiceImpl& service_; bool admitted_ = false; bool writing_ = false;
    std::uint64_t sequence_ = 0; WatchHalTopologyEvent message_;
    std::atomic<bool> scheduled_{false};
    SubscriptionHub<std::uint64_t>::Subscription subscription_;
    std::shared_ptr<LifetimeGate<TopologyReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };

  class ComponentReactor final
      : public grpc::ServerBidiReactor<ComponentSessionMessage,
                                       ComponentSessionMessage> {
   public:
    explicit ComponentReactor(HalServiceImpl& service)
        : service_(service), admitted_(service_.component_admission_.acquire()),
          stream_admitted_(service_.stream_admission_.acquire()),
          gate_(std::make_shared<LifetimeGate<ComponentReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<ComponentReactor>> weak = gate_;
      registration_ = service_.callback_registry().register_callback([weak] {
        if (auto gate = weak.lock()) gate->invoke([](ComponentReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_ || !stream_admitted_) finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                              "component or stream admission limit reached"});
      else StartRead(&request_);
    }
    void OnReadDone(bool ok) override { gate_->invoke([ok](ComponentReactor& r) { r.read_done(ok); }); }
    void OnWriteDone(bool ok) override { gate_->invoke([ok](ComponentReactor& r) { r.write_done(ok); }); }
    void OnCancel() override { gate_->invoke([](ComponentReactor& r) { r.finish({grpc::StatusCode::CANCELLED, "component cancelled"}); }); }
    void OnDone() override {
      gate_->detach(); cleanup();
      registration_.reset();
      if (stream_admitted_) service_.stream_admission_.release();
      delete this;
    }
    void shutdown() { cleanup(); finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"}); }
   private:
    void read_done(bool ok) {
      if (!ok) { finish(grpc::Status::OK); return; }
      auto request = request_; request_.Clear();
      const std::weak_ptr<LifetimeGate<ComponentReactor>> weak_gate = gate_;
      if (!service_.worker_.submit([weak_gate, request = std::move(request)]() mutable {
            auto gate = weak_gate.lock();
            if (gate) gate->invoke([&](ComponentReactor& r) { r.consume(request); });
          })) finish({grpc::StatusCode::RESOURCE_EXHAUSTED, "HAL work queue is full"});
    }
    void consume(const ComponentSessionMessage& request) {
      grpc::Status error;
      bool respond = false;
      switch (request.message_case()) {
        case ComponentSessionMessage::kOpen:
          prefix_ = request.open().prefix().empty() ? request.open().name() : request.open().prefix();
          writer_id_ = request.open().name();
          response_.Clear(); response_.mutable_metadata()->set_writer_id(request.open().name());
          response_.mutable_metadata()->set_ready(false); respond = true; break;
        case ComponentSessionMessage::kPin: {
          const auto& pin = request.pin(); const auto name = prefix_ + "." + pin.name();
          const auto type = static_cast<HalType>(pin.type());
          if (!service_.repository_.add_item(HalItem{name, static_cast<HalScalarType>(type - HAL_TYPE_BIT), true, pin.direction() != HAL_PIN_DIRECTION_IN, default_hal_value(type)})) error = Invalid("pin rejected");
          else owned_.push_back(name);
          service_.topology_wakes_.publish(service_.repository_.generation());
          break;
        }
        case ComponentSessionMessage::kParameter: {
          const auto& value = request.parameter(); const auto name = prefix_ + "." + value.name();
          const auto type = static_cast<HalType>(value.type());
          if (!service_.repository_.add_item(HalItem{name, static_cast<HalScalarType>(type - HAL_TYPE_BIT), false, value.direction() == HAL_PARAM_DIRECTION_RW, default_hal_value(type)})) error = Invalid("parameter rejected");
          else owned_.push_back(name);
          service_.topology_wakes_.publish(service_.repository_.generation());
          break;
        }
        case ComponentSessionMessage::kReady:
          service_.ready_ = request.ready().ready();
          response_.Clear();
          response_.mutable_metadata()->set_writer_id(writer_id_);
          response_.mutable_metadata()->set_ready(service_.ready_);
          respond = true;
          break;
        case ComponentSessionMessage::kValue: {
          auto value = decode_hal_value(request.value().value());
          if (!value || !service_.repository_.write(request.value().item().name(), *value)) error = Invalid("component value rejected");
          else {
            response_.Clear();
            auto* delta = response_.mutable_delta();
            delta->set_sequence(++sequence_);
            auto* encoded = delta->add_values();
            *encoded->mutable_item() = request.value().item();
            encode_hal_value(*value, encoded->mutable_value());
            respond = true;
          }
          break;
        }
        case ComponentSessionMessage::kClose: finish(grpc::Status::OK); return;
        default: error = Invalid("component message required"); break;
      }
      if (!error.ok()) { finish(error); return; }
      if (respond) { writing_ = true; StartWrite(&response_); }
      else StartRead(&request_);
    }
    void write_done(bool ok) { writing_ = false; if (!ok) finish(grpc::Status::OK); else StartRead(&request_); }
    void cleanup() {
      if (cleaned_.exchange(true)) return;
      auto owned = std::make_shared<std::vector<std::string>>(std::move(owned_));
      auto* repository = &service_.repository_;
      auto* admission = &service_.component_admission_;
      if (!admitted_) return;
      if (!service_.worker_.submit_cleanup([repository, admission, owned] {
            for (const auto& name : *owned) repository->remove_item(name);
            admission->release();
          })) {
        for (const auto& name : *owned) repository->remove_item(name);
        admission->release();
      }
    }
    void finish(grpc::Status status) {
      gate_->finish([&](ComponentReactor& reactor) {
        reactor.cleanup();
        reactor.Finish(status);
      });
    }
    HalServiceImpl& service_; bool admitted_ = false; bool stream_admitted_ = false;
    bool writing_ = false;
    std::string prefix_, writer_id_; std::vector<std::string> owned_;
    std::uint64_t sequence_ = 0;
    ComponentSessionMessage request_; ComponentSessionMessage response_;
    std::atomic<bool> cleaned_{false};
    std::shared_ptr<LifetimeGate<ComponentReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };
  HalRepository repository_;
  BoundedExecutor& worker_;
  AdmissionCounter& component_admission_;
  AdmissionCounter& stream_admission_;
  SubscriptionHub<std::uint64_t> topology_wakes_;
  const std::string writer_id_ = "linuxcnc-grpc-server";
  bool ready_ = false;
};

#endif

#ifdef LINUXCNC_GRPC_HAS_SCOPE

ScopeRuntimeState encode_scope_state(ScopeState state) {
  switch (state) {
    case ScopeState::Idle: return SCOPE_RUNTIME_STATE_IDLE;
    case ScopeState::Init: return SCOPE_RUNTIME_STATE_INIT;
    case ScopeState::PreTrigger: return SCOPE_RUNTIME_STATE_PRE_TRIGGER;
    case ScopeState::TriggerWait: return SCOPE_RUNTIME_STATE_TRIGGER_WAIT;
    case ScopeState::PostTrigger: return SCOPE_RUNTIME_STATE_POST_TRIGGER;
    case ScopeState::Done: return SCOPE_RUNTIME_STATE_DONE;
    case ScopeState::Reset: return SCOPE_RUNTIME_STATE_RESET;
    case ScopeState::Invalid: return SCOPE_RUNTIME_STATE_INVALID;
  }
  return SCOPE_RUNTIME_STATE_INVALID;
}

void encode_scope_status(const ScopeStatus& source, std::uint64_t skipped_frames,
                         linuxcnc::v1::ScopeStatus* target) {
  target->set_state(encode_scope_state(source.state));
  target->set_buffer_length(static_cast<std::uint32_t>(std::max(0, source.buffer_length)));
  target->set_record_length(static_cast<std::uint32_t>(std::max(0, source.record_length)));
  target->set_sample_length(static_cast<std::uint32_t>(std::max(0, source.sample_length)));
  target->set_samples(static_cast<std::uint32_t>(std::max(0, source.samples)));
  target->set_start(static_cast<std::uint32_t>(std::max(0, source.start)));
  target->set_multiplier(static_cast<std::uint32_t>(std::max(0, source.multiplier)));
  target->set_watchdog(static_cast<std::uint32_t>(std::max(0, source.watchdog)));
  target->set_thread_name(source.thread_name);
  target->set_sample_period_ns(
      static_cast<std::uint64_t>(std::max<std::int64_t>(0, source.sample_period_ns)));
  target->set_skipped_frames(skipped_frames);
}

template <typename Source>
void encode_scope_channels(const Source& source,
                           google::protobuf::RepeatedPtrField<PackedChannel>* target) {
  for (std::size_t index = 0; index < source.channels.size(); ++index) {
    auto* channel = target->Add();
    channel->set_index(static_cast<std::uint32_t>(index));
    channel->set_enabled(source.channels[index].has_value());
    if (source.channels[index]) {
      for (const auto value : *source.channels[index]) channel->add_values(value);
    }
  }
}

void encode_scope_frame(const ScopeFrame& source, ScopeSessionMessage* target) {
  if (source.kind == ScopeFrameKind::Capture) {
    const auto& capture = std::get<ScopeCapture>(source.payload);
    auto* encoded = target->mutable_capture();
    encode_scope_channels(capture, encoded->mutable_channels());
    encoded->set_samples(static_cast<std::uint32_t>(std::max(0, capture.samples)));
    encoded->set_trigger_index(
        static_cast<std::uint32_t>(std::max(0, capture.trigger_index)));
    encoded->set_sample_period_ns(
        static_cast<std::uint64_t>(std::max<std::int64_t>(0, capture.sample_period_ns)));
    encoded->set_generation(source.generation);
    encoded->set_skipped_frames(source.skipped_frames);
  } else {
    const auto& delta = std::get<ScopeCaptureDelta>(source.payload);
    auto* encoded = target->mutable_roll();
    encode_scope_channels(delta, encoded->mutable_channels());
    encoded->set_samples(static_cast<std::uint32_t>(std::max(0, delta.samples)));
    encoded->set_capacity(static_cast<std::uint32_t>(std::max(0, delta.capacity)));
    encoded->set_sequence(delta.sequence);
    encoded->set_sample_period_ns(
        static_cast<std::uint64_t>(std::max<std::int64_t>(0, delta.sample_period_ns)));
    encoded->set_reset(delta.reset);
    encoded->set_generation(source.generation);
    encoded->set_skipped_frames(source.skipped_frames);
  }
}

grpc::Status scope_error(const ScopeControllerError& error) {
  const auto code = error.code() == -EBUSY ? grpc::StatusCode::RESOURCE_EXHAUSTED
      : (error.code() == -EINVAL || error.code() == -ERANGE)
          ? grpc::StatusCode::INVALID_ARGUMENT
      : (error.code() == -ENOENT || error.code() == -ENODEV)
          ? grpc::StatusCode::UNAVAILABLE
          : grpc::StatusCode::FAILED_PRECONDITION;
  return {code, error.what()};
}

class ScopeServiceImpl final : public ScopeService::CallbackService {
  struct SessionState {
    std::string owner;
    LinuxCncScopeController* controller = nullptr;
    std::atomic<bool> cleanup_started{false};
  };
 public:
  ScopeServiceImpl(const DaemonConfig& config, BoundedExecutor& worker,
                   AdmissionCounter& admission, AdmissionCounter& stream_admission)
      : worker_(worker), admission_(admission), stream_admission_(stream_admission),
        poll_period_(config.scope_period),
        heartbeat_period_(config.scope_heartbeat),
        requested_samples_(config.scope_samples) {}

  void begin_shutdown() { callbacks_.shutdown(); }

  grpc::ServerBidiReactor<ScopeSessionMessage, ScopeSessionMessage>* Session(
      grpc::CallbackServerContext* context) override {
    return new SessionReactor(*this, context->peer() + "#" +
                                      std::to_string(++session_sequence_));
  }

 private:
  class SessionReactor final
      : public grpc::ServerBidiReactor<ScopeSessionMessage, ScopeSessionMessage> {
   public:
    SessionReactor(ScopeServiceImpl& service, std::string owner)
        : service_(service), admitted_(service_.admission_.acquire()),
          stream_admitted_(service_.stream_admission_.acquire()),
          state_(std::make_shared<SessionState>()),
          gate_(std::make_shared<LifetimeGate<SessionReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<SessionReactor>> weak = gate_;
      registration_ = service_.callbacks_.register_callback([weak] {
        if (auto gate = weak.lock()) gate->invoke([](SessionReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      state_->owner = std::move(owner);
      if (!admitted_ || !stream_admitted_) {
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                "scope controller already connected"});
        return;
      }
      const auto state = state_;
      if (!service_.worker_.submit([service = &service_, state, weak] {
            grpc::Status status;
            try {
              if (!service->controller_) {
                service->controller_ = std::make_unique<LinuxCncScopeController>(
                    "linuxcnc-grpc-scope", service->poll_period_,
                    service->heartbeat_period_, service->requested_samples_);
              }
              state->controller = service->controller_.get();
              if (!state->controller->acquire(state->owner)) {
                status = {grpc::StatusCode::RESOURCE_EXHAUSTED,
                          "scope controller already connected"};
              }
            } catch (const ScopeControllerError& error) { status = scope_error(error); }
            if (auto gate = weak.lock()) gate->invoke([&](SessionReactor& reactor) {
              if (!status.ok()) { reactor.finish(status); return; }
              state->controller->set_frame_listener([weak] {
                if (auto listener_gate = weak.lock())
                  listener_gate->invoke([](SessionReactor& value) { value.frame_dirty(); });
              });
              reactor.acquired_ = true;
              reactor.StartRead(&reactor.request_);
            });
          })) finish({grpc::StatusCode::RESOURCE_EXHAUSTED, "scope work queue is full"});
    }
    void OnReadDone(bool ok) override {
      gate_->invoke([ok](SessionReactor& reactor) { reactor.read_done(ok); });
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](SessionReactor& reactor) { reactor.write_done(ok); });
    }
    void OnCancel() override {
      gate_->invoke([](SessionReactor& reactor) {
        reactor.finish({grpc::StatusCode::CANCELLED, "scope session cancelled"});
      });
    }
    void OnDone() override {
      gate_->detach(); registration_.reset(); request_cleanup();
      if (stream_admitted_) service_.stream_admission_.release();
      delete this;
    }
    void shutdown() {
      request_cleanup();
      finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }
   private:
    static ScopeConfig decode_config(
        const linuxcnc::v1::ScopeAcquisitionConfig& wire) {
      ScopeConfig config;
      config.thread_name = wire.thread_name();
      config.multiplier = static_cast<int>(wire.multiplier());
      config.pre_trigger = static_cast<int>(wire.pre_trigger());
      config.trigger_channel = static_cast<int>(wire.trigger_channel());
      config.trigger_level = wire.trigger_level(); config.rising = wire.rising();
      config.automatic = wire.automatic();
      std::array<bool, kScopeChannelCount> assigned{};
      for (const auto& channel : wire.channels()) {
        if (channel.index() >= kScopeChannelCount || assigned[channel.index()])
          throw ScopeControllerError("invalid or duplicate scope channel index", -EINVAL);
        assigned[channel.index()] = true;
        auto& target = config.channels[channel.index()]; target.enabled = channel.enabled();
        if (!channel.enabled()) continue;
        if (channel.item().name().empty())
          throw ScopeControllerError("enabled scope channel requires a HAL item", -EINVAL);
        target.source.name = channel.item().name();
        switch (channel.item().kind()) {
          case HAL_ITEM_KIND_PIN: target.source.kind = ScopeSourceKind::Pin; break;
          case HAL_ITEM_KIND_PARAM: target.source.kind = ScopeSourceKind::Param; break;
          case HAL_ITEM_KIND_SIGNAL: target.source.kind = ScopeSourceKind::Signal; break;
          default: throw ScopeControllerError("unsupported scope HAL item kind", -EINVAL);
        }
      }
      return config;
    }
    void read_done(bool ok) {
      if (!ok) { finish(grpc::Status::OK); return; }
      auto request = request_; request_.Clear(); read_paused_ = true;
      const auto state = state_;
      const std::weak_ptr<LifetimeGate<SessionReactor>> weak = gate_;
      if (!service_.worker_.submit([state, weak, request = std::move(request)]() mutable {
            grpc::Status status;
            std::optional<ScopeSessionMessage> response;
            try {
              auto* controller = state->controller;
              switch (request.message_case()) {
                case ScopeSessionMessage::kAcquire: break;
                case ScopeSessionMessage::kConfigure:
                  controller->configure(state->owner, decode_config(request.configure().config())); break;
                case ScopeSessionMessage::kRun: {
                  ScopeRunMode mode;
                  switch (request.run().mode()) {
                    case SCOPE_RUN_MODE_RUN: mode = ScopeRunMode::Run; break;
                    case SCOPE_RUN_MODE_SINGLE: mode = ScopeRunMode::Single; break;
                    case SCOPE_RUN_MODE_ROLL: mode = ScopeRunMode::Roll; break;
                    default: throw ScopeControllerError("scope run mode is required", -EINVAL);
                  }
                  controller->run(state->owner, mode); break;
                }
                case ScopeSessionMessage::kStop: controller->stop(state->owner); break;
                case ScopeSessionMessage::kTrigger: controller->trigger(state->owner); break;
                case ScopeSessionMessage::kAck: {
                  if (auto frame = controller->acknowledge(
                          state->owner, request.ack().generation())) {
                    ScopeSessionMessage message; encode_scope_frame(*frame, &message);
                    response = std::move(message);
                  }
                  break;
                }
                default: throw ScopeControllerError(
                    "client sent an invalid scope session message", -EINVAL);
              }
              if (request.message_case() != ScopeSessionMessage::kAck) {
                ScopeSessionMessage message;
                encode_scope_status(controller->status(), controller->skipped_frames(),
                                    message.mutable_status());
                response = std::move(message);
              }
            } catch (const ScopeControllerError& error) { status = scope_error(error); }
            if (auto gate = weak.lock()) gate->invoke([&](SessionReactor& reactor) {
              if (!status.ok()) { reactor.finish(status); return; }
              if (response) reactor.offer_control(std::move(*response));
              else { reactor.read_paused_ = false; reactor.StartRead(&reactor.request_); }
            });
          })) finish({grpc::StatusCode::RESOURCE_EXHAUSTED, "scope work queue is full"});
    }
    void frame_dirty() {
      frame_dirty_ = true;
      if (writing_ || frame_fetch_scheduled_ || !acquired_) return;
      frame_fetch_scheduled_ = true; frame_dirty_ = false;
      const auto state = state_;
      const std::weak_ptr<LifetimeGate<SessionReactor>> weak = gate_;
      if (!service_.worker_.submit([state, weak] {
            auto frame = state->controller->next_frame(state->owner);
            if (auto gate = weak.lock()) gate->invoke([&](SessionReactor& reactor) {
              reactor.frame_fetch_scheduled_ = false;
              if (frame) { ScopeSessionMessage message; encode_scope_frame(*frame, &message);
                           reactor.offer_frame(std::move(message)); }
              if (reactor.frame_dirty_) reactor.frame_dirty();
            });
          })) { frame_fetch_scheduled_ = false; finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                                                        "scope work queue is full"}); }
    }
    void offer_control(ScopeSessionMessage message) {
      pending_control_ = std::move(message); pump_write();
    }
    void offer_frame(ScopeSessionMessage message) {
      pending_frame_ = std::move(message); pump_write();
    }
    void pump_write() {
      if (writing_) return;
      if (pending_control_) { response_ = std::move(*pending_control_); pending_control_.reset(); }
      else if (pending_frame_) { response_ = std::move(*pending_frame_); pending_frame_.reset(); }
      else return;
      writing_ = true; StartWrite(&response_);
    }
    void write_done(bool ok) {
      writing_ = false;
      if (!ok) { finish(grpc::Status::OK); return; }
      if (pending_control_ || pending_frame_) { pump_write(); return; }
      if (frame_dirty_) frame_dirty();
      if (read_paused_ && !pending_control_) {
        read_paused_ = false; StartRead(&request_);
      }
    }
    void request_cleanup() {
      if (!admitted_ || state_->cleanup_started.exchange(true)) return;
      const auto state = state_; auto* admission = &service_.admission_;
      if (!service_.worker_.submit_cleanup([state, admission] {
            if (state->controller) {
              state->controller->set_frame_listener({});
              state->controller->release(state->owner);
            }
            admission->release();
          })) {
        if (state->controller) state->controller->release(state->owner);
        admission->release();
      }
    }
    void finish(grpc::Status status) {
      gate_->finish([&](SessionReactor& reactor) {
        reactor.request_cleanup(); reactor.Finish(status);
      });
    }
    ScopeServiceImpl& service_; bool admitted_ = false, stream_admitted_ = false;
    bool acquired_ = false;
    bool writing_ = false, read_paused_ = false, frame_dirty_ = false;
    bool frame_fetch_scheduled_ = false;
    ScopeSessionMessage request_, response_;
    std::optional<ScopeSessionMessage> pending_control_, pending_frame_;
    std::shared_ptr<SessionState> state_;
    std::shared_ptr<LifetimeGate<SessionReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };
  BoundedExecutor& worker_; AdmissionCounter& admission_;
  AdmissionCounter& stream_admission_;
  std::unique_ptr<LinuxCncScopeController> controller_;
  const std::chrono::milliseconds poll_period_, heartbeat_period_;
  const std::size_t requested_samples_;
  std::atomic<std::uint64_t> session_sequence_{0};
  ActiveCallbackRegistry callbacks_;
};

#else

class ScopeServiceImpl final : public ScopeService::CallbackService {
 public:
  ScopeServiceImpl(const DaemonConfig&, BoundedExecutor& worker,
                   AdmissionCounter& admission, AdmissionCounter& stream_admission)
      : worker_(worker), admission_(admission), stream_admission_(stream_admission) {}

  void begin_shutdown() { callbacks_.shutdown(); }

  grpc::ServerBidiReactor<ScopeSessionMessage, ScopeSessionMessage>* Session(
      grpc::CallbackServerContext* context) override {
    return new SessionReactor(*this, context->peer());
  }

 private:
  class SessionReactor final
      : public grpc::ServerBidiReactor<ScopeSessionMessage, ScopeSessionMessage> {
   public:
    SessionReactor(ScopeServiceImpl& service, std::string owner)
        : service_(service), owner_(std::move(owner)),
          admitted_(service_.admission_.acquire()),
          stream_admitted_(service_.stream_admission_.acquire()),
          gate_(std::make_shared<LifetimeGate<SessionReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<SessionReactor>> weak_gate = gate_;
      registration_ = service_.callbacks_.register_callback([weak_gate] {
        if (auto gate = weak_gate.lock()) gate->invoke([](SessionReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_ || !stream_admitted_ || !service_.manager_.acquire(owner_)) {
        finish({grpc::StatusCode::RESOURCE_EXHAUSTED,
                "scope controller already connected"});
        return;
      }
      acquired_ = true;
      StartRead(&request_);
    }
    void OnReadDone(bool ok) override {
      gate_->invoke([ok](SessionReactor& reactor) { reactor.read_done(ok); });
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](SessionReactor& reactor) {
        reactor.writing_ = false;
        if (!ok) reactor.finish(grpc::Status::OK);
        else reactor.StartRead(&reactor.request_);
      });
    }
    void OnCancel() override {
      gate_->invoke([](SessionReactor& reactor) {
        reactor.finish({grpc::StatusCode::CANCELLED, "scope session cancelled"});
      });
    }
    void OnDone() override {
      gate_->detach();
      registration_.reset();
      cleanup();
      if (admitted_) service_.admission_.release();
      if (stream_admitted_) service_.stream_admission_.release();
      delete this;
    }
    void shutdown() { cleanup(); finish({grpc::StatusCode::UNAVAILABLE, "server shutting down"}); }
   private:
    void read_done(bool ok) {
      if (!ok) { finish(grpc::Status::OK); return; }
      auto request = request_; request_.Clear();
      const std::weak_ptr<LifetimeGate<SessionReactor>> weak_gate = gate_;
      if (!service_.worker_.submit([weak_gate, request = std::move(request)]() mutable {
            auto gate = weak_gate.lock();
            if (gate) gate->invoke([&](SessionReactor& reactor) { reactor.consume(request); });
          })) finish({grpc::StatusCode::RESOURCE_EXHAUSTED, "scope work queue is full"});
    }
    void consume(const ScopeSessionMessage& request) {
      response_.Clear();
      if (request.message_case() == ScopeSessionMessage::kAcquire) {
        response_.mutable_status()->set_state(SCOPE_RUNTIME_STATE_IDLE);
      } else if (request.message_case() == ScopeSessionMessage::kAck) {
        const auto next = service_.manager_.acknowledge(owner_, request.ack().generation());
        if (!next) { StartRead(&request_); return; }
        auto* status = response_.mutable_status();
        status->set_state(SCOPE_RUNTIME_STATE_IDLE);
        status->set_generation(next->generation);
        status->set_skipped_frames(next->skipped_frames);
      } else if (request.message_case() == ScopeSessionMessage::kStop) {
        finish(grpc::Status::OK); return;
      } else {
        StartRead(&request_); return;
      }
      writing_ = true; StartWrite(&response_);
    }
    void cleanup() {
      if (acquired_ && !cleaned_.exchange(true)) service_.manager_.release(owner_);
    }
    void finish(grpc::Status status) {
      gate_->finish([&](SessionReactor& reactor) {
        reactor.cleanup();
        reactor.Finish(status);
      });
    }
    ScopeServiceImpl& service_; std::string owner_; bool admitted_ = false;
    bool stream_admitted_ = false;
    bool acquired_ = false; bool writing_ = false;
    ScopeSessionMessage request_; ScopeSessionMessage response_;
    std::atomic<bool> cleaned_{false};
    std::shared_ptr<LifetimeGate<SessionReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };
  ScopeManager manager_;
  BoundedExecutor& worker_;
  AdmissionCounter& admission_;
  AdmissionCounter& stream_admission_;
  ActiveCallbackRegistry callbacks_;
};

#endif

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

  grpc::EnableDefaultHealthCheckService(true);
  if (config.reflection) grpc::reflection::InitProtoReflectionServerBuilderPlugin();

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
  auto machine = std::make_unique<MachineServiceImpl>(
      config, workspaces, position_telemetry, blocking, stream_admission);
  auto program = std::make_unique<ProgramServiceImpl>(
      config, workspaces, blocking, parser_worker, upload_admission,
      stream_admission);
  auto hal = std::make_unique<HalServiceImpl>(
      config, hal_worker, component_admission, stream_admission);
  auto scope = std::make_unique<ScopeServiceImpl>(
      config, scope_worker, scope_admission, stream_admission);
  auto position_websocket = std::make_unique<PositionTelemetryServer>(
      config, position_telemetry);
  grpc::ServerBuilder builder;
  grpc::ResourceQuota resource_quota;
  resource_quota.Resize(256U * 1024U * 1024U);
  resource_quota.SetMaxThreads(kMaxGrpcThreads);
  builder.SetResourceQuota(resource_quota);
  builder.SetMaxReceiveMessageSize(kMaxGrpcMessageBytes);
  builder.SetMaxSendMessageSize(kMaxGrpcMessageBytes);
  std::shared_ptr<grpc::ServerCredentials> credentials;
  if (!config.tls) {
    credentials = grpc::InsecureServerCredentials();
  } else {
    grpc::SslServerCredentialsOptions options;
    options.pem_key_cert_pairs.push_back({read_file(config.tls_private_key),
                                          read_file(config.tls_certificate)});
    options.pem_root_certs = read_file(config.tls_client_ca);
    if (options.pem_key_cert_pairs.front().private_key.empty() ||
        options.pem_key_cert_pairs.front().cert_chain.empty()) {
      std::cerr << "linuxcnc-grpc-server: failed to read TLS key/certificate\n";
      return 2;
    }
    if (config.mtls) options.client_certificate_request = GRPC_SSL_REQUEST_AND_REQUIRE_CLIENT_CERTIFICATE_AND_VERIFY;
    credentials = grpc::SslServerCredentials(options);
  }
  builder.AddListeningPort(config.endpoint, credentials);
  builder.RegisterService(machine.get());
  builder.RegisterService(program.get());
  builder.RegisterService(hal.get());
  builder.RegisterService(scope.get());
  auto server = builder.BuildAndStart();
  if (!server) {
    std::cerr << "linuxcnc-grpc-server: failed to bind " << config.endpoint << '\n';
    return 2;
  }
  std::cout << "linuxcnc-grpc-server listening on " << config.endpoint
            << " and position telemetry on "
            << config.position_telemetry_endpoint << std::endl;
  std::atomic<bool> shutdown_requested{false};
  std::thread control([&] {
    int signal = 0;
    if (sigwait(&shutdown_signals, &signal) != 0) return;
    if (shutdown_requested.exchange(true)) return;
    if (auto* health = server->GetHealthCheckService()) health->Shutdown();
    stream_admission.stop();
    upload_admission.stop();
    component_admission.stop();
    scope_admission.stop();
    blocking.stop_admission();
    parser_worker.stop_admission();
    hal_worker.stop_admission();
    scope_worker.stop_admission();
    position_websocket->stop();
    position_telemetry->close();
    machine->begin_shutdown();
    program->begin_shutdown();
    hal->begin_shutdown();
    scope->begin_shutdown();
    server->Shutdown(std::chrono::system_clock::now() + std::chrono::seconds(5));
  });
  server->Wait();
  stream_admission.stop();
  upload_admission.stop();
  component_admission.stop();
  scope_admission.stop();
  blocking.stop_admission();
  parser_worker.stop_admission();
  hal_worker.stop_admission();
  scope_worker.stop_admission();
  position_websocket->stop();
  position_telemetry->close();
  machine->begin_shutdown();
  program->begin_shutdown();
  hal->begin_shutdown();
  scope->begin_shutdown();
  blocking.drain();
  parser_worker.drain();
  hal_worker.drain();
  scope_worker.drain();
  scope.reset();
  hal.reset();
  program.reset();
  machine.reset();
  position_websocket.reset();
  position_telemetry.reset();
  parser_worker.shutdown();
  hal_worker.shutdown();
  scope_worker.shutdown();
  blocking.shutdown();
  if (control.joinable()) control.join();
  return 0;
  } catch (const std::exception& exception) {
    std::cerr << "linuxcnc-grpc-server: initialization failed: "
              << exception.what() << '\n';
    return 2;
  }
}

}  // namespace linuxcnc::server
