#include "grpc/service_factories.hpp"

#include "unary_task_reactor.hpp"
#include "linuxcnc_grpc/command_coordinator.hpp"
#include "linuxcnc_grpc/nml_adapter.hpp"

#include "linuxcnc/v1/linuxcnc.grpc.pb.h"
#include <google/protobuf/empty.pb.h>
#include <grpcpp/grpcpp.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace linuxcnc::server::detail {
namespace {

using namespace ::linuxcnc::v1;

// Keep this list adjacent to ExecuteCommand: adding a protobuf oneof command
// requires adding both its transport mapping and its native NML case. The
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

::grpc::Status Invalid(const std::string& message) {
  return {::grpc::StatusCode::INVALID_ARGUMENT, message};
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

class CommandTaskReactor final : public ::grpc::ServerUnaryReactor {
 public:
  using Submit = std::function<::grpc::Status(
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
          ::grpc::Status status;
          try {
            status = submit(token, &ticket, &policy);
          } catch (const std::exception& error) {
            status = {::grpc::StatusCode::INTERNAL, error.what()};
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
      finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
              "blocking work queue is full"});
    }
  }

  void OnCancel() override {
    token_->cancel();
    finish({::grpc::StatusCode::CANCELLED,
            "command wait cancelled; any accepted work continues"});
  }

  void OnDone() override {
    gate_->detach();
    registration_.reset();
    delete this;
  }

  void shutdown() {
    token_->cancel();
    finish({::grpc::StatusCode::UNAVAILABLE,
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
    reactor.Finish(::grpc::Status::OK);
    });
  }

  void finish(::grpc::Status status) {
    gate_->finish([&](CommandTaskReactor& reactor) { reactor.Finish(status); });
  }

  ExecuteCommandResponse* response_;
  std::shared_ptr<CancellationToken> token_ = std::make_shared<CancellationToken>();
  std::shared_ptr<LifetimeGate<CommandTaskReactor>> gate_;
  ActiveCallbackRegistry::Registration registration_;
};

using MachineCallbackBase = ::linuxcnc::v1::MachineService::WithCallbackMethod_GetStatus<
    MachineService::WithCallbackMethod_ExecuteCommand<
        MachineService::WithCallbackMethod_WatchErrors<
            MachineService::WithCallbackMethod_WatchStatus<
                MachineService::WithCallbackMethod_ConfigurePositionHistory<
                    MachineService::WithCallbackMethod_ClearPositionHistory<
                        MachineService::Service>>>>>>;

class MachineServiceImpl final : public MachineCallbackBase,
                                 public ManagedGrpcService {
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
    shutdown();
  }

  ::grpc::Service* service() noexcept override {
    return static_cast<MachineCallbackBase*>(this);
  }

  void shutdown() override {
    if (stopping_.exchange(true, std::memory_order_relaxed)) return;
    status_wakes_.close();
    error_wakes_.close();
    callbacks_.shutdown();
    position_condition_.notify_all();
    if (position_poller_.joinable()) position_poller_.join();
  }

  ::grpc::ServerUnaryReactor* GetStatus(::grpc::CallbackServerContext*,
                                     const GetStatusRequest*,
                                     GetStatusResponse* response) override {
    return new detail::UnaryTaskReactor<GetStatusResponse>(
        blocking_, callbacks_, response, [this](const CancellationToken& cancelled,
                                    GetStatusResponse* task_response) {
          if (cancelled.cancelled()) {
            return ::grpc::Status(::grpc::StatusCode::CANCELLED, "RPC cancelled");
          }
          return get_status(task_response);
        });
  }

  ::grpc::Status get_status(GetStatusResponse* response) {
    NmlStatusSnapshot snapshot;
    std::uint64_t sequence = 0;
    if (!read_status(&snapshot, &sequence)) return {::grpc::StatusCode::UNAVAILABLE,
                                         "LinuxCNC NML status channel is unavailable"};
    response->set_sequence(sequence);
    fill_status(snapshot, response->mutable_status());
    return ::grpc::Status::OK;
  }

  ::grpc::ServerWriteReactor<WatchStatusEvent>* WatchStatus(
      ::grpc::CallbackServerContext*, const WatchStatusRequest* request) override {
    return new StatusReactor(*this, request->after_sequence());
  }

  ::grpc::ServerUnaryReactor* ExecuteCommand(
      ::grpc::CallbackServerContext*, const ExecuteCommandRequest* request,
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

  ::grpc::Status submit_command(const std::shared_ptr<CancellationToken>& cancelled,
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
    if (!nml_.connect()) return {::grpc::StatusCode::UNAVAILABLE,
                                 "LinuxCNC NML command channel is unavailable"};
    try {
      *ticket = nml_.submit(std::move(command), [cancelled] {
        return cancelled->cancelled();
      });
    } catch (const std::exception& error) {
      const auto message = std::string(error.what());
      const auto code = message.find("queue is full") != std::string::npos
          ? ::grpc::StatusCode::RESOURCE_EXHAUSTED : ::grpc::StatusCode::INTERNAL;
      return {code, message};
    }
    *policy = request->wait_policy() == WAIT_POLICY_ACCEPTED
        ? CommandWaitPolicy::Accepted : CommandWaitPolicy::Completed;
    return ::grpc::Status::OK;
  }

  ::grpc::ServerWriteReactor<LinuxCNCError>* WatchErrors(
      ::grpc::CallbackServerContext*, const google::protobuf::Empty*) override {
    return new ErrorReactor(*this);
  }

  ::grpc::ServerUnaryReactor* ConfigurePositionHistory(
      ::grpc::CallbackServerContext*, const PositionHistoryConfig* request,
      google::protobuf::Empty* response) override {
    auto owned_request = std::make_shared<PositionHistoryConfig>(*request);
    return new detail::UnaryTaskReactor<google::protobuf::Empty>(
        blocking_, callbacks_, response, [this, owned_request = std::move(owned_request)](
            const CancellationToken& cancelled, google::protobuf::Empty*) {
          if (cancelled.cancelled()) {
            return ::grpc::Status(::grpc::StatusCode::CANCELLED, "RPC cancelled");
          }
          return configure_position(*owned_request);
        });
  }

  ::grpc::Status configure_position(const PositionHistoryConfig& request) {
    if (request.capacity() > 100000) {
      return {::grpc::StatusCode::RESOURCE_EXHAUSTED,
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
    return ::grpc::Status::OK;
  }

  ::grpc::ServerUnaryReactor* ClearPositionHistory(
      ::grpc::CallbackServerContext*, const google::protobuf::Empty*,
      google::protobuf::Empty* response) override {
    return new detail::UnaryTaskReactor<google::protobuf::Empty>(
        blocking_, callbacks_, response, [this](const CancellationToken& cancelled,
                                   google::protobuf::Empty*) {
          if (cancelled.cancelled()) {
            return ::grpc::Status(::grpc::StatusCode::CANCELLED, "RPC cancelled");
          }
          positions_->clear();
          return ::grpc::Status::OK;
        });
  }

 private:
  class StatusReactor final : public ::grpc::ServerWriteReactor<WatchStatusEvent> {
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
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
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
        reactor.finish({::grpc::StatusCode::CANCELLED, "status stream cancelled"});
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
      finish({::grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }

   private:
    void write_done(bool ok) {
      writing_ = false;
      if (!ok) {
        finish(::grpc::Status::OK);
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
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "wire encoding queue is full"});
      }
    }

    void wake() {
      if (writing_ || gate_->state() != LifetimeGate<StatusReactor>::State::Open) return;
      const auto history = service_.status_history();
      if (history.empty()) {
        finish({::grpc::StatusCode::UNAVAILABLE,
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

    void finish(::grpc::Status status) {
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

  class ErrorReactor final : public ::grpc::ServerWriteReactor<LinuxCNCError> {
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
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
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
        reactor.finish({::grpc::StatusCode::CANCELLED, "error stream cancelled"});
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
      finish({::grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }

   private:
    void write_done(bool ok) {
      writing_ = false;
      if (!ok) {
        finish(::grpc::Status::OK);
        return;
      }
      cursor_ = writing_sequence_;
      wake();
    }
    void wake() {
      if (writing_ || gate_->state() != LifetimeGate<ErrorReactor>::State::Open) return;
      const auto available = service_.errors_.after(cursor_);
      if (available.behind) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
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

    void finish(::grpc::Status status) {
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
}  // namespace

std::unique_ptr<ManagedGrpcService> make_machine_service(
    const DaemonConfig& config,
    std::shared_ptr<ProgramWorkspaceStore> workspaces,
    std::shared_ptr<PositionTelemetry> positions, BoundedExecutor& blocking,
    AdmissionCounter& stream_admission) {
  return std::make_unique<MachineServiceImpl>(
      config, std::move(workspaces), std::move(positions), blocking,
      stream_admission);
}

}  // namespace linuxcnc::server::detail
