#include <google/protobuf/empty.pb.h>
#include <grpcpp/grpcpp.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <filesystem>
#include <functional>
#include <iterator>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include "grpc/service_factories.hpp"
#include "linuxcnc/v1/linuxcnc.grpc.pb.h"
#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/command_coordinator.hpp"
#include "linuxcnc_grpc/daemon_config.hpp"
#include "linuxcnc_grpc/nml_adapter.hpp"
#include "linuxcnc_grpc/position_telemetry.hpp"
#include "linuxcnc_grpc/program_workspace.hpp"
#include "machine_status_codec.hpp"
#include "unary_task_reactor.hpp"

namespace linuxcnc::server::detail {
namespace {

using namespace ::linuxcnc::v1;

constexpr std::uint32_t kMaxPositionSamplePeriodMs = 60'000;

::grpc::Status Invalid(const std::string& message) {
  return {::grpc::StatusCode::INVALID_ARGUMENT, message};
}

class CommandTaskReactor final : public ::grpc::ServerUnaryReactor {
 public:
  using Submit =
      std::function<::grpc::Status(const std::shared_ptr<CancellationToken>&,
                                   CommandTicket*, CommandWaitPolicy*)>;

  CommandTaskReactor(BoundedExecutor& executor,
                     ActiveCallbackRegistry& registry,
                     ExecuteCommandResponse* response, Submit submit)
      : response_(response),
        gate_(std::make_shared<LifetimeGate<CommandTaskReactor>>(this)) {
    const std::weak_ptr<LifetimeGate<CommandTaskReactor>> weak_gate = gate_;
    registration_ = registry.register_callback([weak_gate] {
      if (auto gate = weak_gate.lock())
        gate->invoke([](CommandTaskReactor& reactor) { reactor.shutdown(); });
    });
    if (!registration_) {
      shutdown();
      return;
    }
    if (!executor.submit(
            [weak_gate, submit = std::move(submit), token = token_]() mutable {
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
      reactor.response_->set_command_sequence(result.accepted_sequence);
      if (result.state == CommandState::Failed) {
        reactor.response_->set_status(RCS_STATUS_ERROR);
        reactor.response_->mutable_error()->set_type(
            NML_MESSAGE_TYPE_NML_ERROR);
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
  std::shared_ptr<CancellationToken> token_ =
      std::make_shared<CancellationToken>();
  std::shared_ptr<LifetimeGate<CommandTaskReactor>> gate_;
  ActiveCallbackRegistry::Registration registration_;
};

using MachineCallbackBase =
    ::linuxcnc::v1::MachineService::WithCallbackMethod_GetStatus<
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
        workspace_activation_(
            std::make_shared<WorkspaceActivation>(workspaces_)),
        positions_(std::move(positions)),
        status_period_(config.status_period),
        error_period_(config.error_period),
        position_period_(config.position_period),
        replay_capacity_(
            std::max<std::size_t>(1, config.status_replay_capacity)),
        stopping_(false),
        position_poller_([this] { poll_positions(); }) {}

  ~MachineServiceImpl() override { shutdown(); }

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
        blocking_, callbacks_, response,
        [this](const CancellationToken& cancelled,
               GetStatusResponse* task_response) {
          if (cancelled.cancelled()) {
            return ::grpc::Status(::grpc::StatusCode::CANCELLED,
                                  "RPC cancelled");
          }
          return get_status(task_response);
        });
  }

  ::grpc::Status get_status(GetStatusResponse* response) {
    NmlStatusSnapshot snapshot;
    std::uint64_t sequence = 0;
    if (!read_status(&snapshot, &sequence))
      return {::grpc::StatusCode::UNAVAILABLE,
              "LinuxCNC NML status channel is unavailable"};
    response->set_sequence(sequence);
    fill_status(snapshot, response->mutable_status());
    return ::grpc::Status::OK;
  }

  ::grpc::ServerWriteReactor<WatchStatusEvent>* WatchStatus(
      ::grpc::CallbackServerContext*,
      const WatchStatusRequest* request) override {
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
            CommandTicket* ticket, CommandWaitPolicy* policy) {
          return submit_command(cancelled, owned_request.get(), ticket, policy);
        });
  }

  ::grpc::Status submit_command(
      const std::shared_ptr<CancellationToken>& cancelled,
      const ExecuteCommandRequest* request, CommandTicket* ticket,
      CommandWaitPolicy* policy) {
    NmlCommand command;
    switch (request->command_case()) {
      case ExecuteCommandRequest::kSetTaskMode:
        command.kind = NmlCommandKind::SetTaskMode;
        command.integer =
            static_cast<std::int32_t>(request->set_task_mode().mode());
        break;
      case ExecuteCommandRequest::kSetState:
        command.kind = NmlCommandKind::SetTaskState;
        command.integer =
            static_cast<std::int32_t>(request->set_state().state());
        break;
      case ExecuteCommandRequest::kTaskPlanSynch:
        command.kind = NmlCommandKind::TaskPlanSynch;
        break;
      case ExecuteCommandRequest::kResetInterpreter:
        command.kind = NmlCommandKind::ResetInterpreter;
        break;
      case ExecuteCommandRequest::kProgramOpen:
        command.kind = NmlCommandKind::ProgramOpen;
        if (!workspaces_ ||
            request->program_open().entry().workspace_id().empty())
          return Invalid("program_open requires a workspace handle");
        {
          const auto workspace = request->program_open().entry().workspace_id();
          const auto relative_path =
              request->program_open().entry().relative_path();
          std::filesystem::path resolved_entry;
          if (!workspaces_->resolve_entry(workspace, relative_path,
                                          &resolved_entry)) {
            return Invalid("program workspace entry is missing or unsafe");
          }
          if (!workspaces_->pin(workspace)) {
            return Invalid("program workspace became unavailable");
          }
          auto lease =
              std::make_shared<PendingWorkspaceLease>(workspaces_, workspace);
          command.prepare = [store = workspaces_, workspace, relative_path,
                             lease](NmlCommand& prepared) {
            std::filesystem::path materialized;
            if (!store->materialize(workspace, relative_path, &materialized)) {
              throw std::runtime_error(
                  "program workspace entry became unavailable or unsafe");
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
      case ExecuteCommandRequest::kPauseProgram:
        command.kind = NmlCommandKind::Pause;
        break;
      case ExecuteCommandRequest::kResumeProgram:
        command.kind = NmlCommandKind::Resume;
        break;
      case ExecuteCommandRequest::kStepProgram:
        command.kind = NmlCommandKind::Step;
        break;
      case ExecuteCommandRequest::kReverseProgram:
        command.kind = NmlCommandKind::Reverse;
        break;
      case ExecuteCommandRequest::kForwardProgram:
        command.kind = NmlCommandKind::Forward;
        break;
      case ExecuteCommandRequest::kStop:
        command.kind = NmlCommandKind::Stop;
        break;
      case ExecuteCommandRequest::kAbortTask:
        command.kind = NmlCommandKind::AbortTask;
        break;
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
        command.integer =
            static_cast<std::int32_t>(request->set_traj_mode().mode());
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
                              ? request->set_spindle_override().spindle_index()
                              : 0;
        break;
      case ExecuteCommandRequest::kOverrideLimits:
        command.kind = NmlCommandKind::OverrideLimits;
        break;
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
        command.integer =
            request->set_spindle_override_enable().has_spindle_index()
                ? request->set_spindle_override_enable().spindle_index()
                : 0;
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
                              ? request->spindle_on().spindle_index()
                              : 0;
        command.boolean = !request->spindle_on().has_wait_for_speed() ||
                          request->spindle_on().wait_for_speed();
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
                              ? request->spindle_brake().spindle_index()
                              : 0;
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
      case ExecuteCommandRequest::kLoadToolTable:
        command.kind = NmlCommandKind::LoadToolTable;
        break;
      case ExecuteCommandRequest::kSetTool: {
        command.kind = NmlCommandKind::SetTool;
        const auto& source = request->set_tool().tool();
        command.tool.tool_no = source.tool_no();
        command.tool.has_pocket_no = source.has_pocket_no();
        command.tool.pocket_no = source.pocket_no();
        command.tool.has_offset = source.has_offset();
        command.tool.has_wear_offset = source.has_wear_offset();
        command.tool.has_diameter = source.has_diameter();
        command.tool.diameter = source.diameter();
        command.tool.has_front_angle = source.has_front_angle();
        command.tool.front_angle = source.front_angle();
        command.tool.has_back_angle = source.has_back_angle();
        command.tool.back_angle = source.back_angle();
        command.tool.has_orientation = source.has_orientation();
        command.tool.orientation = source.orientation();
        command.tool.has_comment = source.has_comment();
        command.tool.comment = source.comment();
        command.tool.offset_values =
            std::min<int>(source.offset().values_size(), 9);
        for (int index = 0; index < source.offset().values_size() && index < 9;
             ++index)
          command.tool.offset.values[static_cast<std::size_t>(index)] =
              source.offset().values(index);
        command.tool.wear_offset_values =
            std::min<int>(source.wear_offset().values_size(), 9);
        for (int index = 0;
             index < source.wear_offset().values_size() && index < 9; ++index)
          command.tool.wear_offset.values[static_cast<std::size_t>(index)] =
              source.wear_offset().values(index);
        break;
      }
      case ExecuteCommandRequest::kDeleteTool:
        command.kind = NmlCommandKind::DeleteTool;
        command.integer = request->delete_tool().tool_no();
        break;
      case ExecuteCommandRequest::kSetDigitalOutput:
        if (request->set_digital_output().index() < 0 ||
            request->set_digital_output().index() >=
                NmlAdapter::kDigitalOutputLimit) {
          return Invalid("digital output index is out of range");
        }
        command.kind = NmlCommandKind::SetDigitalOutput;
        command.integer = request->set_digital_output().index();
        command.boolean = request->set_digital_output().value();
        break;
      case ExecuteCommandRequest::kSetAnalogOutput:
        if (request->set_analog_output().index() < 0 ||
            request->set_analog_output().index() >=
                NmlAdapter::kAnalogOutputLimit) {
          return Invalid("analog output index is out of range");
        }
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
    if (!nml_.connect())
      return {::grpc::StatusCode::UNAVAILABLE,
              "LinuxCNC NML command channel is unavailable"};
    try {
      *ticket = nml_.submit(std::move(command),
                            [cancelled] { return cancelled->cancelled(); });
    } catch (const std::exception& error) {
      const auto message = std::string(error.what());
      const auto code = message.find("queue is full") != std::string::npos
                            ? ::grpc::StatusCode::RESOURCE_EXHAUSTED
                            : ::grpc::StatusCode::INTERNAL;
      return {code, message};
    }
    *policy = request->wait_policy() == WAIT_POLICY_ACCEPTED
                  ? CommandWaitPolicy::Accepted
                  : CommandWaitPolicy::Completed;
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
        blocking_, callbacks_, response,
        [this, owned_request = std::move(owned_request)](
            const CancellationToken& cancelled, google::protobuf::Empty*) {
          if (cancelled.cancelled()) {
            return ::grpc::Status(::grpc::StatusCode::CANCELLED,
                                  "RPC cancelled");
          }
          return configure_position(*owned_request);
        });
  }

  ::grpc::Status configure_position(const PositionHistoryConfig& request) {
    if (request.capacity() > 100000) {
      return {::grpc::StatusCode::RESOURCE_EXHAUSTED,
              "position history capacity exceeds 100000 samples"};
    }
    if (request.sample_period_ms() > kMaxPositionSamplePeriodMs) {
      return Invalid("position history sample period exceeds 60000 ms");
    }
    if (request.capacity() > 0) {
      positions_->configure(request.capacity());
    }
    {
      std::lock_guard lock(position_mutex_);
      if (request.has_enabled()) position_enabled_ = request.enabled();
      if (request.sample_period_ms() > 0) {
        position_period_ =
            std::chrono::milliseconds(request.sample_period_ms());
      }
      ++position_config_generation_;
    }
    position_condition_.notify_all();
    if (request.has_enabled() && !request.enabled()) positions_->clear();
    return ::grpc::Status::OK;
  }

  ::grpc::ServerUnaryReactor* ClearPositionHistory(
      ::grpc::CallbackServerContext*, const google::protobuf::Empty*,
      google::protobuf::Empty* response) override {
    return new detail::UnaryTaskReactor<google::protobuf::Empty>(
        blocking_, callbacks_, response,
        [this](const CancellationToken& cancelled, google::protobuf::Empty*) {
          if (cancelled.cancelled()) {
            return ::grpc::Status(::grpc::StatusCode::CANCELLED,
                                  "RPC cancelled");
          }
          positions_->clear();
          return ::grpc::Status::OK;
        });
  }

 private:
  class StatusReactor final
      : public ::grpc::ServerWriteReactor<WatchStatusEvent> {
   public:
    StatusReactor(MachineServiceImpl& service, std::uint64_t after)
        : service_(service),
          after_(after),
          admitted_(service_.stream_admission_.acquire()),
          gate_(std::make_shared<LifetimeGate<StatusReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<StatusReactor>> weak_gate = gate_;
      registration_ = service_.callbacks_.register_callback([weak_gate] {
        if (auto gate = weak_gate.lock())
          gate->invoke([](StatusReactor& reactor) { reactor.shutdown(); });
      });
      if (!registration_) {
        shutdown();
        return;
      }
      if (!admitted_) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "stream admission limit reached"});
        return;
      }
      subscription_ =
          service_.status_wakes_.subscribe([weak_gate](const std::uint64_t&) {
            auto gate = weak_gate.lock();
            if (gate)
              gate->invoke(
                  [](StatusReactor& reactor) { reactor.schedule_wake(); });
          });
      schedule_wake();
    }

    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](StatusReactor& reactor) { reactor.write_done(ok); });
    }

    void OnCancel() override {
      gate_->invoke([](StatusReactor& reactor) {
        reactor.subscription_.reset();
        reactor.finish(
            {::grpc::StatusCode::CANCELLED, "status stream cancelled"});
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
          wake_scheduled_.exchange(true))
        return;
      const std::weak_ptr<LifetimeGate<StatusReactor>> weak_gate = gate_;
      if (!service_.blocking_.submit([weak_gate] {
            auto gate = weak_gate.lock();
            if (gate)
              gate->invoke([](StatusReactor& reactor) {
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
      if (writing_ ||
          gate_->state() != LifetimeGate<StatusReactor>::State::Open)
        return;
      auto selection = service_.select_status_history(
          initial_written_ ? cursor_ : after_, !initial_written_);
      if (selection.entries.empty()) {
        finish({::grpc::StatusCode::UNAVAILABLE,
                "LinuxCNC NML status snapshot is unavailable"});
        return;
      }
      auto& latest = selection.entries.back();
      message_.Clear();
      if (!initial_written_) {
        if (after_ != 0 && selection.anchor_retained) {
          message_.set_sequence(latest.sequence);
          auto* replay = message_.mutable_replay();
          replay->set_from_sequence(after_);
          replay->set_to_sequence(latest.sequence);
          auto prior = selection.entries.begin();
          for (auto entry = std::next(prior); entry != selection.entries.end();
               ++entry, ++prior) {
            auto delta = make_status_delta(prior->snapshot, entry->snapshot,
                                           entry->sequence);
            if (delta) *replay->add_deltas() = std::move(*delta);
          }
        } else {
          message_.set_sequence(latest.sequence);
          fill_status(latest.snapshot, message_.mutable_snapshot());
        }
      } else {
        if (latest.sequence == cursor_) return;
        if (!selection.anchor_retained) {
          message_.set_sequence(latest.sequence);
          fill_status(latest.snapshot, message_.mutable_snapshot());
        } else {
          auto delta =
              make_status_delta(previous_, latest.snapshot, latest.sequence);
          if (!delta) return;
          message_.set_sequence(latest.sequence);
          *message_.mutable_delta() = std::move(*delta);
        }
      }
      writing_snapshot_ = std::move(latest.snapshot);
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
        if (auto gate = weak_gate.lock())
          gate->invoke([](ErrorReactor& reactor) { reactor.shutdown(); });
      });
      if (!registration_) {
        shutdown();
        return;
      }
      if (!admitted_) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "stream admission limit reached"});
        return;
      }
      cursor_ = service_.errors_.next_sequence() - 1;
      subscription_ =
          service_.error_wakes_.subscribe([weak_gate](const std::uint64_t&) {
            auto gate = weak_gate.lock();
            if (gate)
              gate->invoke([](ErrorReactor& reactor) { reactor.wake(); });
          });
      wake();
    }

    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](ErrorReactor& reactor) { reactor.write_done(ok); });
    }

    void OnCancel() override {
      gate_->invoke([](ErrorReactor& reactor) {
        reactor.subscription_.reset();
        reactor.finish(
            {::grpc::StatusCode::CANCELLED, "error stream cancelled"});
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
      if (writing_ || gate_->state() != LifetimeGate<ErrorReactor>::State::Open)
        return;
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

  struct StatusHistorySelection {
    bool anchor_retained = false;
    std::vector<StatusHistoryEntry> entries;
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

  StatusHistorySelection select_status_history(std::uint64_t anchor,
                                               bool include_replay) const {
    std::lock_guard lock(status_mutex_);
    StatusHistorySelection selection;
    if (history_.empty()) return selection;
    const auto found = std::find_if(
        history_.begin(), history_.end(),
        [anchor](const auto& entry) { return entry.sequence == anchor; });
    selection.anchor_retained = found != history_.end();
    if (include_replay && anchor != 0 && selection.anchor_retained) {
      selection.entries.assign(found, history_.end());
    } else {
      selection.entries.push_back(history_.back());
    }
    return selection;
  }

  void poll_positions() {
    auto next_status = std::chrono::steady_clock::now();
    auto next_error = next_status;
    auto next_position = next_status;
    while (!stopping_.load(std::memory_order_relaxed)) {
      bool enabled = false;
      std::chrono::milliseconds position_period;
      std::uint64_t generation = 0;
      {
        std::lock_guard lock(position_mutex_);
        enabled = position_enabled_;
        position_period = position_period_;
        generation = position_config_generation_;
      }
      const auto now = std::chrono::steady_clock::now();
      const bool status_due = now >= next_status;
      const bool position_due = enabled && now >= next_position;
      if (status_due || position_due) {
        NmlStatusSnapshot snapshot;
        if (nml_.poll_status(&snapshot)) {
          if (status_due) observe_status(snapshot);
          if (position_due) {
            PositionSample sample;
            for (std::size_t index = 0; index < sample.coordinates.size();
                 ++index) {
              sample.coordinates[index] =
                  snapshot.motion_stat.traj.position.values[index] -
                  snapshot.task_stat.tool_offset.values[index];
            }
            sample.motion_type = snapshot.motion_type;
            positions_->append(sample);
          }
        }
        if (status_due) {
          next_status = now + status_period_;
        }
        if (position_due) next_position = now + position_period;
      } else if (!enabled) {
        next_position = now + position_period;
      }
      if (now >= next_error) {
        if (auto error = nml_.poll_error()) {
          const auto sequence = errors_.publish(std::move(*error));
          error_wakes_.publish(sequence);
        }
        next_error = now + error_period_;
      }
      std::unique_lock lock(position_mutex_);
      auto deadline = std::min(next_status, next_error);
      if (position_enabled_) deadline = std::min(deadline, next_position);
      position_condition_.wait_until(lock, deadline, [this, generation] {
        return stopping_.load(std::memory_order_relaxed) ||
               position_config_generation_ != generation;
      });
      if (position_config_generation_ != generation) {
        next_position = std::chrono::steady_clock::now();
      }
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
                      ? static_cast<std::uint64_t>(fresh.echo_serial_number)
                      : 1;
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
  std::uint64_t position_config_generation_ = 0;
  std::atomic<bool> stopping_;
  std::thread position_poller_;
};
}  // namespace

std::unique_ptr<ManagedGrpcService> make_machine_service(
    const DaemonConfig& config,
    std::shared_ptr<ProgramWorkspaceStore> workspaces,
    std::shared_ptr<PositionTelemetry> positions, BoundedExecutor& blocking,
    AdmissionCounter& stream_admission) {
  return std::make_unique<MachineServiceImpl>(config, std::move(workspaces),
                                              std::move(positions), blocking,
                                              stream_admission);
}

}  // namespace linuxcnc::server::detail
