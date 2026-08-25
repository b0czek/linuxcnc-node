#include "linuxcnc_grpc/nml_adapter.hpp"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <utility>

#ifdef LINUXCNC_GRPC_HAS_NML
#include "cms.hh"
#include "emc.hh"
#include "emc_nml.hh"
#include "inifile.h"
#include "nml.hh"
#include "nml_oi.hh"
#include "rcs.hh"
#include "timer.hh"
#include "tooldata.hh"

static_assert(linuxcnc::server::NmlAdapter::kDigitalOutputLimit ==
              EMCMOT_MAX_DIO);
static_assert(linuxcnc::server::NmlAdapter::kAnalogOutputLimit ==
              EMCMOT_MAX_AIO);
#endif

namespace linuxcnc::server {

#ifdef LINUXCNC_GRPC_HAS_NML
namespace {
EmcPose to_emc_pose(const NmlPose& pose) {
  EmcPose result{};
  result.tran.x = pose.values[0];
  result.tran.y = pose.values[1];
  result.tran.z = pose.values[2];
  result.a = pose.values[3];
  result.b = pose.values[4];
  result.c = pose.values[5];
  result.u = pose.values[6];
  result.v = pose.values[7];
  result.w = pose.values[8];
  return result;
}

NmlPose from_emc_pose(const EmcPose& pose) {
  NmlPose result;
  result.values = {pose.tran.x, pose.tran.y, pose.tran.z, pose.a, pose.b,
                   pose.c,      pose.u,      pose.v,      pose.w};
  return result;
}

NmlJointStatus from_joint(const EMC_JOINT_STAT& source) {
  NmlJointStatus result;
  result.joint_type = source.jointType;
  result.units = source.units;
  result.backlash = source.backlash;
  result.min_position_limit = source.minPositionLimit;
  result.max_position_limit = source.maxPositionLimit;
  result.min_ferror = source.minFerror;
  result.max_ferror = source.maxFerror;
  result.ferror_current = source.ferrorCurrent;
  result.ferror_high_mark = source.ferrorHighMark;
  result.output = source.output;
  result.input = source.input;
  result.velocity = source.velocity;
  result.in_position = source.inpos;
  result.homing = source.homing;
  result.homed = source.homed;
  result.fault = source.fault;
  result.enabled = source.enabled;
  result.min_soft_limit = source.minSoftLimit;
  result.max_soft_limit = source.maxSoftLimit;
  result.min_hard_limit = source.minHardLimit;
  result.max_hard_limit = source.maxHardLimit;
  result.override_limits = source.overrideLimits;
  return result;
}

NmlAxisStatus from_axis(const EMC_AXIS_STAT& source) {
  return {source.minPositionLimit, source.maxPositionLimit, source.velocity};
}

NmlSpindleStatus from_spindle(const EMC_SPINDLE_STAT& source) {
  NmlSpindleStatus result;
  result.speed = source.speed;
  result.feedback = source.feedback;
  result.override_scale = source.spindle_scale;
  result.css_maximum = source.css_maximum;
  result.css_factor = source.css_factor;
  result.direction = source.direction;
  result.brake = source.brake;
  result.increasing = source.increasing;
  result.enabled = source.enabled;
  result.orient_state = source.orient_state;
  result.orient_fault = source.orient_fault;
  result.spindle_override_enabled = source.spindle_override_enabled;
  result.homed = source.homed;
  return result;
}

void fill_tool(const CANON_TOOL_TABLE& source, NmlToolEntry* result) {
  result->tool_no = source.toolno;
  result->pocket_no = source.pocketno;
  result->offset = from_emc_pose(source.offset);
  result->wear_offset = from_emc_pose(source.wear_offset);
  result->diameter = source.diameter;
  result->front_angle = source.frontangle;
  result->back_angle = source.backangle;
  result->orientation = source.orientation;
  result->comment = source.comment;
}
}  // namespace
#endif

struct NmlAdapter::Impl {
  explicit Impl(std::string path, std::size_t capacity)
      : nml_file(std::move(path)), commands(capacity) {}

  std::string nml_file;
  CommandCoordinator commands;
#ifdef LINUXCNC_GRPC_HAS_NML
  std::unique_ptr<RCS_CMD_CHANNEL> command;
  std::unique_ptr<RCS_STAT_CHANNEL> status;
  std::unique_ptr<NML> errors;
  mutable std::mutex mutex;
  mutable std::mutex tool_mutex;
  bool tool_mmap_ready = false;
  std::string tool_table_filename;

  bool wait_for_serial(int serial) {
    const auto deadline =
        std::chrono::steady_clock::now() + std::chrono::seconds(5);
    while (std::chrono::steady_clock::now() < deadline) {
      {
        std::lock_guard lock(mutex);
        if (status && status->peek() == EMC_STAT_TYPE) {
          auto* value = static_cast<EMC_STAT*>(status->get_address());
          if (value && value->echo_serial_number > serial) return true;
          if (value && value->echo_serial_number == serial) {
            if (value->status == RCS_STATUS::ERROR) {
              throw std::runtime_error("LinuxCNC rejected the command");
            }
            if (value->status == RCS_STATUS::DONE) return true;
          }
        }
      }
      esleep(0.01);
    }
    throw std::runtime_error(
        "timed out waiting for LinuxCNC command completion");
  }

  bool ensure_tool_mmap_unlocked() {
    if (tool_mmap_ready) return true;
    tool_mmap_ready = tool_mmap_user() == 0;
    return tool_mmap_ready;
  }

  std::optional<int> update_tool_data(NmlToolEntry* source) {
    std::lock_guard lock(tool_mutex);
    if (!ensure_tool_mmap_unlocked()) return std::nullopt;
    int index = tooldata_find_index_for_tool(source->tool_no);
    bool is_new = false;
    if (index < 0) {
      const int next_index = tooldata_last_index_get() + 1;
      const int first_index = tool_mmap_is_random_toolchanger() ? 0 : 1;
      for (int candidate = first_index; candidate < next_index; ++candidate) {
        CANON_TOOL_TABLE candidate_entry;
        if (tooldata_get(&candidate_entry, candidate) == IDX_OK &&
            candidate_entry.toolno < 0) {
          index = candidate;
          is_new = true;
          break;
        }
      }
      if (index < 0) {
        index = next_index;
        is_new = true;
      }
      if (index >= CANON_POCKETS_MAX) return std::nullopt;
    }
    CANON_TOOL_TABLE entry = tooldata_entry_init();
    if (!is_new && tooldata_get(&entry, index) != IDX_OK) return std::nullopt;
    entry.toolno = source->tool_no;
    if (source->has_pocket_no) entry.pocketno = source->pocket_no;
    if (source->has_offset) {
      auto values = from_emc_pose(entry.offset);
      std::copy_n(source->offset.values.begin(), source->offset_values,
                  values.values.begin());
      entry.offset = to_emc_pose(values);
    }
    if (source->has_wear_offset) {
      auto values = from_emc_pose(entry.wear_offset);
      std::copy_n(source->wear_offset.values.begin(),
                  source->wear_offset_values, values.values.begin());
      entry.wear_offset = to_emc_pose(values);
    }
    if (source->has_diameter) entry.diameter = source->diameter;
    if (source->has_front_angle) entry.frontangle = source->front_angle;
    if (source->has_back_angle) entry.backangle = source->back_angle;
    if (source->has_orientation) entry.orientation = source->orientation;
    if (source->has_comment) {
      std::strncpy(entry.comment, source->comment.c_str(),
                   sizeof(entry.comment) - 1);
      entry.comment[sizeof(entry.comment) - 1] = '\0';
    }
    if (tooldata_put(entry, index) == IDX_FAIL) return std::nullopt;
    if (!tool_table_filename.empty())
      (void)tooldata_save(tool_table_filename.c_str());
    fill_tool(entry, source);
    return index;
  }

  void read_tool_table_path() {
    if (!status || status->peek() != EMC_STAT_TYPE) return;
    const auto* value = static_cast<const EMC_STAT*>(status->get_address());
    if (!value || value->task.ini_filename[0] == '\0') return;
    char filename[LINELEN] = {};
    if (iniFindString(value->task.ini_filename, "TOOL_TABLE", "EMCIO", filename,
                      sizeof(filename)) != 0 ||
        filename[0] == '\0')
      return;
    std::filesystem::path path(filename);
    if (path.is_relative())
      path =
          std::filesystem::path(value->task.ini_filename).parent_path() / path;
    std::lock_guard lock(tool_mutex);
    tool_table_filename = std::filesystem::absolute(path).string();
  }
#endif
  bool connected = false;
};

NmlAdapter::NmlAdapter(std::string nml_file, std::size_t command_capacity)
    : impl_(std::make_unique<Impl>(std::move(nml_file), command_capacity)) {}

NmlAdapter::~NmlAdapter() {
  impl_->commands.shutdown();
  disconnect();
}

bool NmlAdapter::connect() {
#ifdef LINUXCNC_GRPC_HAS_NML
  std::lock_guard lock(impl_->mutex);
  if (impl_->connected) return true;
  if (impl_->nml_file.empty()) return false;
  impl_->command = std::make_unique<RCS_CMD_CHANNEL>(
      emcFormat, "emcCommand", "xemc", impl_->nml_file.c_str());
  impl_->status = std::make_unique<RCS_STAT_CHANNEL>(
      emcFormat, "emcStatus", "xemc", impl_->nml_file.c_str());
  impl_->errors = std::make_unique<NML>(emcFormat, "emcError", "xemc",
                                        impl_->nml_file.c_str());
  impl_->connected = impl_->command->valid() && impl_->status->valid() &&
                     impl_->errors->valid();
  if (impl_->connected) impl_->read_tool_table_path();
  if (!impl_->connected) {
    impl_->command.reset();
    impl_->status.reset();
    impl_->errors.reset();
  }
  return impl_->connected;
#else
  return false;
#endif
}

bool NmlAdapter::connected() const noexcept {
#ifdef LINUXCNC_GRPC_HAS_NML
  std::lock_guard lock(impl_->mutex);
#endif
  return impl_->connected;
}

void NmlAdapter::disconnect() {
#ifdef LINUXCNC_GRPC_HAS_NML
  std::lock_guard lock(impl_->mutex);
  impl_->errors.reset();
  impl_->status.reset();
  impl_->command.reset();
#endif
  impl_->connected = false;
}

bool NmlAdapter::poll_status(NmlStatusSnapshot* snapshot) {
#ifdef LINUXCNC_GRPC_HAS_NML
  if (!snapshot || !connect()) return false;
  std::lock_guard lock(impl_->mutex);
  if (impl_->status->peek() != EMC_STAT_TYPE) return false;
  auto* status = static_cast<EMC_STAT*>(impl_->status->get_address());
  if (!status) return false;
  snapshot->echo_serial_number = status->echo_serial_number;
  snapshot->rcs_status = static_cast<std::int32_t>(status->status);
  snapshot->task_mode = static_cast<std::int32_t>(status->task.mode);
  snapshot->task_state = static_cast<std::int32_t>(status->task.state);
  snapshot->exec_state = static_cast<std::int32_t>(status->task.execState);
  snapshot->interp_state = static_cast<std::int32_t>(status->task.interpState);
  snapshot->stop_state = static_cast<std::int32_t>(status->task.stopState);
  snapshot->current_line = status->task.currentLine;
  snapshot->motion_line = status->task.motionLine;
  snapshot->read_line = status->task.readLine;
  snapshot->optional_stop = status->task.optional_stop_state;
  snapshot->block_delete = status->task.block_delete_state;
  snapshot->file = status->task.file;
  snapshot->command = status->task.command;
  snapshot->ini_filename = status->task.ini_filename;
  snapshot->debug = status->debug;
  snapshot->motion_type = status->motion.traj.motion_type;
  snapshot->actual_position = {status->motion.traj.actualPosition.tran.x,
                               status->motion.traj.actualPosition.tran.y,
                               status->motion.traj.actualPosition.tran.z,
                               status->motion.traj.actualPosition.a,
                               status->motion.traj.actualPosition.b,
                               status->motion.traj.actualPosition.c,
                               status->motion.traj.actualPosition.u,
                               status->motion.traj.actualPosition.v,
                               status->motion.traj.actualPosition.w};
  auto& task = snapshot->task_stat;
  task.mode = snapshot->task_mode;
  task.state = snapshot->task_state;
  task.exec_state = snapshot->exec_state;
  task.interp_state = snapshot->interp_state;
  task.stop_state = snapshot->stop_state;
  task.call_level = status->task.callLevel;
  task.motion_line = status->task.motionLine;
  task.current_line = status->task.currentLine;
  task.read_line = status->task.readLine;
  task.optional_stop_state = status->task.optional_stop_state;
  task.block_delete_state = status->task.block_delete_state;
  task.input_timeout = status->task.input_timeout;
  task.file = status->task.file;
  task.command = status->task.command;
  task.ini_filename = status->task.ini_filename;
  task.g5x_offset = from_emc_pose(status->task.g5x_offset);
  task.g5x_index = status->task.g5x_index;
  task.g5x_offsets.clear();
  task.g5x_rotations.clear();
  for (const auto& pose : status->task.g5x_offsets)
    task.g5x_offsets.push_back(from_emc_pose(pose));
  for (const auto rotation : status->task.g5x_rotations)
    task.g5x_rotations.push_back(rotation);
  task.g92_offset = from_emc_pose(status->task.g92_offset);
  task.g28_position = from_emc_pose(status->task.g28_position);
  task.g30_position = from_emc_pose(status->task.g30_position);
  task.rotation_xy = status->task.rotation_xy;
  task.tool_offset = from_emc_pose(status->task.toolOffset);
  task.active_g_codes.assign(std::begin(status->task.activeGCodes),
                             std::end(status->task.activeGCodes));
  task.active_m_codes.assign(std::begin(status->task.activeMCodes),
                             std::end(status->task.activeMCodes));
  task.active_settings.assign(std::begin(status->task.activeSettings),
                              std::end(status->task.activeSettings));
  task.program_units = static_cast<std::int32_t>(status->task.programUnits);
  task.interpreter_error_code = status->task.interpreter_errcode;
  task.task_paused = status->task.task_paused;
  task.delay_left = status->task.delayLeft;
  task.queued_mdi_commands = status->task.queuedMDIcommands;

  auto& motion = snapshot->motion_stat;
  const auto& source_traj = status->motion.traj;
  auto& traj = motion.traj;
  traj.linear_units = source_traj.linearUnits;
  traj.angular_units = source_traj.angularUnits;
  traj.cycle_time = source_traj.cycleTime;
  traj.joints = source_traj.joints;
  traj.spindles = source_traj.spindles;
  traj.available_axes.clear();
  for (int index = 0; index < 9; ++index)
    if (source_traj.axis_mask & (1 << index))
      traj.available_axes.push_back(index);
  traj.mode = static_cast<std::int32_t>(source_traj.mode);
  traj.enabled = source_traj.enabled;
  traj.in_position = source_traj.inpos;
  traj.queue = source_traj.queue;
  traj.active_queue = source_traj.activeQueue;
  traj.queue_full = source_traj.queueFull;
  traj.id = source_traj.id;
  traj.paused = source_traj.paused;
  traj.single_stepping = source_traj.single_stepping;
  traj.feed_rate_override = source_traj.scale;
  traj.rapid_rate_override = source_traj.rapid_scale;
  traj.position = from_emc_pose(source_traj.position);
  traj.actual_position = from_emc_pose(source_traj.actualPosition);
  traj.acceleration = source_traj.acceleration;
  traj.max_velocity = source_traj.maxVelocity;
  traj.max_acceleration = source_traj.maxAcceleration;
  traj.probed_position = from_emc_pose(source_traj.probedPosition);
  traj.probe_tripped = source_traj.probe_tripped;
  traj.probing = source_traj.probing;
  traj.probe_val = source_traj.probeval;
  traj.kinematics_type = source_traj.kinematics_type;
  traj.motion_type = source_traj.motion_type;
  traj.distance_to_go = source_traj.distance_to_go;
  traj.dtg = from_emc_pose(source_traj.dtg);
  traj.current_velocity = source_traj.current_vel;
  traj.feed_override_enabled = source_traj.feed_override_enabled;
  traj.adaptive_feed_enabled = source_traj.adaptive_feed_enabled;
  traj.feed_hold_enabled = source_traj.feed_hold_enabled;
  motion.joints.clear();
  motion.axes.clear();
  motion.spindles.clear();
  for (const auto& joint : status->motion.joint)
    motion.joints.push_back(from_joint(joint));
  for (const auto& axis : status->motion.axis)
    motion.axes.push_back(from_axis(axis));
  for (const auto& spindle : status->motion.spindle)
    motion.spindles.push_back(from_spindle(spindle));
  motion.digital_input.assign(std::begin(status->motion.synch_di),
                              std::end(status->motion.synch_di));
  motion.digital_output.assign(std::begin(status->motion.synch_do),
                               std::end(status->motion.synch_do));
  motion.analog_input.assign(std::begin(status->motion.analog_input),
                             std::end(status->motion.analog_input));
  motion.analog_output.assign(std::begin(status->motion.analog_output),
                              std::end(status->motion.analog_output));
  snapshot->io_stat.pocket_prepped = status->io.tool.pocketPrepped;
  snapshot->io_stat.tool_in_spindle = status->io.tool.toolInSpindle;
  snapshot->io_stat.tool_from_pocket = status->io.tool.toolFromPocket;
  snapshot->io_stat.mist = status->io.coolant.mist;
  snapshot->io_stat.flood = status->io.coolant.flood;
  snapshot->io_stat.estop = status->io.aux.estop;
  snapshot->tool_table.clear();
  std::lock_guard tool_lock(impl_->tool_mutex);
  if (impl_->ensure_tool_mmap_unlocked()) {
    const int last = std::min(CANON_POCKETS_MAX - 1, tooldata_last_index_get());
    for (int index = 0; index <= last; ++index) {
      CANON_TOOL_TABLE entry{};
      if (tooldata_get(&entry, index) == IDX_OK) {
        NmlToolEntry value;
        fill_tool(entry, &value);
        snapshot->tool_table.push_back(std::move(value));
      }
    }
  }
  return true;
#else
  (void)snapshot;
  return false;
#endif
}

std::optional<NmlErrorEvent> NmlAdapter::poll_error() {
#ifdef LINUXCNC_GRPC_HAS_NML
  if (!connect()) return std::nullopt;
  std::lock_guard lock(impl_->mutex);
  const auto type = impl_->errors->read();
  if (type == 0) return std::nullopt;
  NmlErrorEvent result;
  result.type = static_cast<std::int32_t>(type);
  char message[LINELEN] = {};
  switch (type) {
    case EMC_OPERATOR_ERROR_TYPE:
      std::strncpy(
          message,
          static_cast<EMC_OPERATOR_ERROR*>(impl_->errors->get_address())->error,
          sizeof(message) - 1);
      break;
    case EMC_OPERATOR_TEXT_TYPE:
      std::strncpy(
          message,
          static_cast<EMC_OPERATOR_TEXT*>(impl_->errors->get_address())->text,
          sizeof(message) - 1);
      break;
    case EMC_OPERATOR_DISPLAY_TYPE:
      std::strncpy(
          message,
          static_cast<EMC_OPERATOR_DISPLAY*>(impl_->errors->get_address())
              ->display,
          sizeof(message) - 1);
      break;
    case NML_ERROR_TYPE:
      std::strncpy(message,
                   static_cast<NML_ERROR*>(impl_->errors->get_address())->error,
                   sizeof(message) - 1);
      break;
    case NML_TEXT_TYPE:
      std::strncpy(message,
                   static_cast<NML_TEXT*>(impl_->errors->get_address())->text,
                   sizeof(message) - 1);
      break;
    case NML_DISPLAY_TYPE:
      std::strncpy(
          message,
          static_cast<NML_DISPLAY*>(impl_->errors->get_address())->display,
          sizeof(message) - 1);
      break;
    default:
      std::snprintf(message, sizeof(message), "NML message type %d",
                    static_cast<int>(type));
      break;
  }
  result.message = message;
  return result;
#else
  return std::nullopt;
#endif
}

CommandTicket NmlAdapter::submit(NmlCommand command,
                                 std::function<bool()> cancelled) {
#ifdef LINUXCNC_GRPC_HAS_NML
  return impl_->commands.submit_with_context(
      [this, command = std::move(command)](CommandContext& context) mutable {
        // A request cancelled while it was still queued has not reached
        // LinuxCNC and can be dropped safely. After the first NML write below,
        // cancellation no longer participates in command completion.
        if (context.cancelled && context.cancelled()) {
          throw std::runtime_error(
              "command cancelled before LinuxCNC acceptance");
        }
        if (!connect())
          throw std::runtime_error("LinuxCNC NML channels are unavailable");
        if (command.kind != NmlCommandKind::ProgramOpen && command.prepare) {
          command.prepare(command);
        }
        std::unique_ptr<RCS_CMD_MSG> message;
        bool direct_tool_mutation = false;
        switch (command.kind) {
          case NmlCommandKind::SetTaskMode: {
            auto value = std::make_unique<EMC_TASK_SET_MODE>();
            value->mode = static_cast<EMC_TASK_MODE>(command.integer);
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetTaskState: {
            auto value = std::make_unique<EMC_TASK_SET_STATE>();
            value->state = static_cast<EMC_TASK_STATE>(command.integer);
            message = std::move(value);
            break;
          }
          case NmlCommandKind::TaskPlanSynch:
            message = std::make_unique<EMC_TASK_PLAN_SYNCH>();
            break;
          case NmlCommandKind::ResetInterpreter:
            message = std::make_unique<EMC_TASK_PLAN_INIT>();
            break;
          case NmlCommandKind::ProgramOpen: {
            auto close = std::make_unique<EMC_TASK_PLAN_CLOSE>();
            {
              std::lock_guard lock(impl_->mutex);
              if (impl_->command->write(close.get()) != 0)
                throw std::runtime_error(
                    "failed to close the previous LinuxCNC program");
            }
            impl_->wait_for_serial(close->serial_number);
            if (command.prepare) command.prepare(command);
            auto value = std::make_unique<EMC_TASK_PLAN_OPEN>();
            if (command.path.size() >= sizeof(value->file))
              throw std::runtime_error("program path too long");
            std::strncpy(value->file, command.path.c_str(),
                         sizeof(value->file) - 1);
            value->file[sizeof(value->file) - 1] = '\0';
            message = std::move(value);
            break;
          }
          case NmlCommandKind::ProgramClose:
            message = std::make_unique<EMC_TASK_PLAN_CLOSE>();
            break;
          case NmlCommandKind::Stop:
            message = std::make_unique<EMC_TASK_STOP>();
            break;
          case NmlCommandKind::Pause:
            message = std::make_unique<EMC_TASK_PLAN_PAUSE>();
            break;
          case NmlCommandKind::Resume:
            message = std::make_unique<EMC_TASK_PLAN_RESUME>();
            break;
          case NmlCommandKind::Step:
            message = std::make_unique<EMC_TASK_PLAN_STEP>();
            break;
          case NmlCommandKind::Reverse:
            message = std::make_unique<EMC_TASK_PLAN_REVERSE>();
            break;
          case NmlCommandKind::Forward:
            message = std::make_unique<EMC_TASK_PLAN_FORWARD>();
            break;
          case NmlCommandKind::AbortTask:
            message = std::make_unique<EMC_TASK_ABORT>();
            break;
          case NmlCommandKind::SetOptionalStop: {
            auto value = std::make_unique<EMC_TASK_PLAN_SET_OPTIONAL_STOP>();
            value->state = command.boolean;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetBlockDelete: {
            auto value = std::make_unique<EMC_TASK_PLAN_SET_BLOCK_DELETE>();
            value->state = command.boolean;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::Run: {
            auto value = std::make_unique<EMC_TASK_PLAN_RUN>();
            value->line = command.integer;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::Mdi: {
            auto value = std::make_unique<EMC_TASK_PLAN_EXECUTE>();
            if (command.text.size() >= sizeof(value->command))
              throw std::runtime_error("MDI command too long");
            std::strncpy(value->command, command.text.c_str(),
                         sizeof(value->command) - 1);
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetTrajMode: {
            auto value = std::make_unique<EMC_TRAJ_SET_MODE>();
            value->mode = static_cast<EMC_TRAJ_MODE>(command.integer);
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetMaxVelocity: {
            auto value = std::make_unique<EMC_TRAJ_SET_MAX_VELOCITY>();
            value->velocity = command.number;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetFeedRate: {
            auto value = std::make_unique<EMC_TRAJ_SET_SCALE>();
            value->scale = std::max(0.0, command.number);
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetRapidRate: {
            auto value = std::make_unique<EMC_TRAJ_SET_RAPID_SCALE>();
            value->scale = std::max(0.0, command.number);
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetSpindleOverride: {
            auto value = std::make_unique<EMC_TRAJ_SET_SPINDLE_SCALE>();
            value->scale = std::max(0.0, command.number);
            value->spindle = command.integer;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::OverrideLimits: {
            auto value = std::make_unique<EMC_JOINT_OVERRIDE_LIMITS>();
            value->joint = 0;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::TeleopEnable: {
            auto value = std::make_unique<EMC_TRAJ_SET_TELEOP_ENABLE>();
            value->enable = command.boolean ? 1 : 0;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetFeedOverrideEnable: {
            auto value = std::make_unique<EMC_TRAJ_SET_FO_ENABLE>();
            value->mode = command.boolean ? 1 : 0;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetSpindleOverrideEnable: {
            auto value = std::make_unique<EMC_TRAJ_SET_SO_ENABLE>();
            value->mode = command.boolean ? 1 : 0;
            value->spindle = command.integer;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetFeedHoldEnable: {
            auto value = std::make_unique<EMC_TRAJ_SET_FH_ENABLE>();
            value->mode = command.boolean ? 1 : 0;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetAdaptiveFeedEnable: {
            auto value = std::make_unique<EMC_MOTION_ADAPTIVE>();
            value->status = command.boolean ? 1 : 0;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::HomeJoint: {
            auto value = std::make_unique<EMC_JOINT_HOME>();
            value->joint = command.integer;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::UnhomeJoint: {
            auto value = std::make_unique<EMC_JOINT_UNHOME>();
            value->joint = command.integer;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::JogStop: {
            auto value = std::make_unique<EMC_JOG_STOP>();
            value->joint_or_axis = command.integer;
            value->jjogmode = command.boolean ? 1 : 0;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::JogContinuous: {
            auto value = std::make_unique<EMC_JOG_CONT>();
            value->joint_or_axis = command.integer;
            value->jjogmode = command.boolean ? 1 : 0;
            value->vel = command.number;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::JogIncrement: {
            auto value = std::make_unique<EMC_JOG_INCR>();
            value->joint_or_axis = command.integer;
            value->jjogmode = command.boolean ? 1 : 0;
            value->vel = command.number;
            value->incr = command.number2;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetMinPositionLimit: {
            auto value = std::make_unique<EMC_JOINT_SET_MIN_POSITION_LIMIT>();
            value->joint = command.integer;
            value->limit = command.number;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetMaxPositionLimit: {
            auto value = std::make_unique<EMC_JOINT_SET_MAX_POSITION_LIMIT>();
            value->joint = command.integer;
            value->limit = command.number;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SpindleOn: {
            auto value = std::make_unique<EMC_SPINDLE_ON>();
            value->spindle = command.integer;
            value->speed = command.number;
            value->wait_for_spindle_at_speed = command.boolean ? 1 : 0;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SpindleIncrease: {
            auto value = std::make_unique<EMC_SPINDLE_INCREASE>();
            value->spindle = command.integer;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SpindleDecrease: {
            auto value = std::make_unique<EMC_SPINDLE_DECREASE>();
            value->spindle = command.integer;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SpindleOff: {
            auto value = std::make_unique<EMC_SPINDLE_OFF>();
            value->spindle = command.integer;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SpindleBrake:
            if (command.boolean) {
              auto value = std::make_unique<EMC_SPINDLE_BRAKE_ENGAGE>();
              value->spindle = command.integer;
              message = std::move(value);
            } else {
              auto value = std::make_unique<EMC_SPINDLE_BRAKE_RELEASE>();
              value->spindle = command.integer;
              message = std::move(value);
            }
            break;
          case NmlCommandKind::SetMist:
            if (command.boolean)
              message = std::make_unique<EMC_COOLANT_MIST_ON>();
            else
              message = std::make_unique<EMC_COOLANT_MIST_OFF>();
            break;
          case NmlCommandKind::SetFlood:
            if (command.boolean)
              message = std::make_unique<EMC_COOLANT_FLOOD_ON>();
            else
              message = std::make_unique<EMC_COOLANT_FLOOD_OFF>();
            break;
          case NmlCommandKind::LoadToolTable: {
            auto value = std::make_unique<EMC_TOOL_LOAD_TOOL_TABLE>();
            value->file[0] = '\0';
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetTool: {
            // Keep the shared tool table (including comment and wear data)
            // coherent before sending the corresponding NML offset command.
            const auto tooldata_index = impl_->update_tool_data(&command.tool);
            if (!tooldata_index) {
              throw std::runtime_error("unable to update LinuxCNC tool table");
            }
            auto value = std::make_unique<EMC_TOOL_SET_OFFSET>();
            value->pocket = *tooldata_index;
            value->toolno = command.tool.tool_no;
            value->offset = to_emc_pose(command.tool.offset);
            value->wear_offset = to_emc_pose(command.tool.wear_offset);
            value->wear_offset_valid = true;
            value->diameter = command.tool.diameter;
            value->frontangle = command.tool.front_angle;
            value->backangle = command.tool.back_angle;
            value->orientation = command.tool.orientation;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::DeleteTool: {
            std::lock_guard tool_lock(impl_->tool_mutex);
            if (!impl_->ensure_tool_mmap_unlocked())
              throw std::runtime_error("LinuxCNC tool table is unavailable");
            const auto index = tooldata_find_index_for_tool(command.integer);
            if (index < 0)
              throw std::runtime_error("tool is not present in the tool table");
            if (tooldata_put(tooldata_entry_init(), index) == IDX_FAIL)
              throw std::runtime_error(
                  "failed to delete tool from LinuxCNC tool table");
            if (impl_->tool_table_filename.empty() ||
                tooldata_save(impl_->tool_table_filename.c_str()) != 0) {
              throw std::runtime_error(
                  "failed to save LinuxCNC tool table after deletion");
            }
            direct_tool_mutation = true;
            break;
          }
          case NmlCommandKind::SetDigitalOutput: {
            if (command.integer < 0 ||
                command.integer >= NmlAdapter::kDigitalOutputLimit) {
              throw std::invalid_argument(
                  "digital output index is out of range");
            }
            auto value = std::make_unique<EMC_MOTION_SET_DOUT>();
            value->index = static_cast<unsigned char>(command.integer);
            value->start = value->end = command.boolean ? 1 : 0;
            value->now = 1;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetAnalogOutput: {
            if (command.integer < 0 ||
                command.integer >= NmlAdapter::kAnalogOutputLimit) {
              throw std::invalid_argument(
                  "analog output index is out of range");
            }
            auto value = std::make_unique<EMC_MOTION_SET_AOUT>();
            value->index = static_cast<unsigned char>(command.integer);
            value->start = value->end = command.number;
            value->now = 1;
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SetDebugLevel: {
            auto value = std::make_unique<EMC_SET_DEBUG>();
            value->debug = static_cast<unsigned>(std::max(0, command.integer));
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SendOperatorError: {
            auto value = std::make_unique<EMC_OPERATOR_ERROR>();
            if (command.text.size() >= sizeof(value->error))
              throw std::runtime_error("operator message too long");
            std::strncpy(value->error, command.text.c_str(),
                         sizeof(value->error) - 1);
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SendOperatorText: {
            auto value = std::make_unique<EMC_OPERATOR_TEXT>();
            if (command.text.size() >= sizeof(value->text))
              throw std::runtime_error("operator message too long");
            std::strncpy(value->text, command.text.c_str(),
                         sizeof(value->text) - 1);
            message = std::move(value);
            break;
          }
          case NmlCommandKind::SendOperatorDisplay: {
            auto value = std::make_unique<EMC_OPERATOR_DISPLAY>();
            if (command.text.size() >= sizeof(value->display))
              throw std::runtime_error("operator message too long");
            std::strncpy(value->display, command.text.c_str(),
                         sizeof(value->display) - 1);
            message = std::move(value);
            break;
          }
        }
        if (direct_tool_mutation) {
          context.mark_accepted();
          if (command.on_completed) command.on_completed();
          return;
        }
        if (!message) throw std::runtime_error("unsupported LinuxCNC command");
        auto* command_message = message.get();
        {
          std::lock_guard lock(impl_->mutex);
          if (impl_->command->write(command_message) != 0) {
            throw std::runtime_error("failed to write LinuxCNC NML command");
          }
        }
        const int serial = command_message->serial_number;
        context.mark_accepted();
        impl_->wait_for_serial(serial);
        if (command.on_completed) command.on_completed();
      },
      std::move(cancelled));
#else
  (void)command;
  (void)cancelled;
  throw std::runtime_error("LinuxCNC NML support was not built");
#endif
}

}  // namespace linuxcnc::server
