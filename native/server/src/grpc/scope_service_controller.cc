#include <grpcpp/grpcpp.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cerrno>
#include <chrono>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "grpc/scope_service_impl.hpp"
#include "linuxcnc/v1/linuxcnc.grpc.pb.h"
#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/daemon_config.hpp"
#include "linuxcnc_grpc/scope_controller.hpp"

namespace linuxcnc::server::detail {
namespace {

using namespace linuxcnc::v1;

ScopeRuntimeState encode_scope_state(ScopeState state) {
  switch (state) {
    case ScopeState::Idle:
      return SCOPE_RUNTIME_STATE_IDLE;
    case ScopeState::Init:
      return SCOPE_RUNTIME_STATE_INIT;
    case ScopeState::PreTrigger:
      return SCOPE_RUNTIME_STATE_PRE_TRIGGER;
    case ScopeState::TriggerWait:
      return SCOPE_RUNTIME_STATE_TRIGGER_WAIT;
    case ScopeState::PostTrigger:
      return SCOPE_RUNTIME_STATE_POST_TRIGGER;
    case ScopeState::Done:
      return SCOPE_RUNTIME_STATE_DONE;
    case ScopeState::Reset:
      return SCOPE_RUNTIME_STATE_RESET;
    case ScopeState::Invalid:
      return SCOPE_RUNTIME_STATE_INVALID;
  }
  return SCOPE_RUNTIME_STATE_INVALID;
}

void encode_scope_status(const ScopeStatus& source,
                         std::uint64_t skipped_frames,
                         linuxcnc::v1::ScopeStatus* target) {
  target->set_state(encode_scope_state(source.state));
  target->set_buffer_length(
      static_cast<std::uint32_t>(std::max(0, source.buffer_length)));
  target->set_record_length(
      static_cast<std::uint32_t>(std::max(0, source.record_length)));
  target->set_sample_length(
      static_cast<std::uint32_t>(std::max(0, source.sample_length)));
  target->set_samples(static_cast<std::uint32_t>(std::max(0, source.samples)));
  target->set_start(static_cast<std::uint32_t>(std::max(0, source.start)));
  target->set_multiplier(
      static_cast<std::uint32_t>(std::max(0, source.multiplier)));
  target->set_watchdog(
      static_cast<std::uint32_t>(std::max(0, source.watchdog)));
  target->set_thread_name(source.thread_name);
  target->set_sample_period_ns(static_cast<std::uint64_t>(
      std::max<std::int64_t>(0, source.sample_period_ns)));
  target->set_skipped_frames(skipped_frames);
}

template <typename Source>
void encode_scope_channels(
    const Source& source,
    google::protobuf::RepeatedPtrField<PackedChannel>* target) {
  for (std::size_t index = 0; index < source.channels.size(); ++index) {
    auto* channel = target->Add();
    channel->set_index(static_cast<std::uint32_t>(index));
    channel->set_enabled(source.channels[index].has_value());
    if (source.channels[index]) {
      for (const auto value : *source.channels[index]) {
        channel->add_values(value);
      }
    }
  }
}

void encode_scope_frame(const ScopeFrame& source, ScopeSessionMessage* target) {
  if (source.kind == ScopeFrameKind::Capture) {
    const auto& capture = std::get<ScopeCapture>(source.payload);
    auto* encoded = target->mutable_capture();
    encode_scope_channels(capture, encoded->mutable_channels());
    encoded->set_samples(
        static_cast<std::uint32_t>(std::max(0, capture.samples)));
    encoded->set_trigger_index(
        static_cast<std::uint32_t>(std::max(0, capture.trigger_index)));
    encoded->set_sample_period_ns(static_cast<std::uint64_t>(
        std::max<std::int64_t>(0, capture.sample_period_ns)));
    encoded->set_generation(source.generation);
    encoded->set_skipped_frames(source.skipped_frames);
  } else {
    const auto& delta = std::get<ScopeCaptureDelta>(source.payload);
    auto* encoded = target->mutable_roll();
    encode_scope_channels(delta, encoded->mutable_channels());
    encoded->set_samples(
        static_cast<std::uint32_t>(std::max(0, delta.samples)));
    encoded->set_capacity(
        static_cast<std::uint32_t>(std::max(0, delta.capacity)));
    encoded->set_sequence(delta.sequence);
    encoded->set_sample_period_ns(static_cast<std::uint64_t>(
        std::max<std::int64_t>(0, delta.sample_period_ns)));
    encoded->set_reset(delta.reset);
    encoded->set_generation(source.generation);
    encoded->set_skipped_frames(source.skipped_frames);
  }
}

::grpc::Status scope_error(const ScopeControllerError& error) {
  const auto code = error.code() == -EBUSY
                        ? ::grpc::StatusCode::RESOURCE_EXHAUSTED
                    : (error.code() == -EINVAL || error.code() == -ERANGE)
                        ? ::grpc::StatusCode::INVALID_ARGUMENT
                    : (error.code() == -ENOENT || error.code() == -ENODEV)
                        ? ::grpc::StatusCode::UNAVAILABLE
                        : ::grpc::StatusCode::FAILED_PRECONDITION;
  return {code, error.what()};
}

class ScopeServiceImpl final : public ScopeService::CallbackService,
                               public ManagedGrpcService {
  struct SessionState {
    std::string owner;
    LinuxCncScopeController* controller = nullptr;
    std::atomic<bool> cleanup_started{false};
  };

 public:
  ::grpc::Service* service() noexcept override { return this; }

  ScopeServiceImpl(const DaemonConfig& config, BoundedExecutor& worker,
                   AdmissionCounter& admission,
                   AdmissionCounter& stream_admission)
      : worker_(worker),
        admission_(admission),
        stream_admission_(stream_admission),
        poll_period_(config.scope_period),
        heartbeat_period_(config.scope_heartbeat),
        requested_samples_(config.scope_samples) {}

  void shutdown() override { callbacks_.shutdown(); }

  ::grpc::ServerBidiReactor<ScopeSessionMessage, ScopeSessionMessage>* Session(
      ::grpc::CallbackServerContext* context) override {
    return new SessionReactor(
        *this, context->peer() + "#" + std::to_string(++session_sequence_));
  }

 private:
  class SessionReactor final
      : public ::grpc::ServerBidiReactor<ScopeSessionMessage,
                                         ScopeSessionMessage> {
   public:
    SessionReactor(ScopeServiceImpl& service, std::string owner)
        : service_(service),
          admitted_(service_.admission_.acquire()),
          stream_admitted_(service_.stream_admission_.acquire()),
          state_(std::make_shared<SessionState>()),
          gate_(std::make_shared<LifetimeGate<SessionReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<SessionReactor>> weak = gate_;
      registration_ = service_.callbacks_.register_callback([weak] {
        if (auto gate = weak.lock())
          gate->invoke([](SessionReactor& reactor) { reactor.shutdown(); });
      });
      if (!registration_) {
        shutdown();
        return;
      }
      state_->owner = std::move(owner);
      if (!admitted_ || !stream_admitted_) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "scope controller already connected"});
        return;
      }
      const auto state = state_;
      if (!service_.worker_.submit([service = &service_, state, weak] {
            ::grpc::Status status;
            try {
              if (!service->controller_) {
                service->controller_ =
                    std::make_unique<LinuxCncScopeController>(
                        "linuxcnc-grpc-scope", service->poll_period_,
                        service->heartbeat_period_,
                        service->requested_samples_);
              }
              state->controller = service->controller_.get();
              if (!state->controller->acquire(state->owner)) {
                status = {::grpc::StatusCode::RESOURCE_EXHAUSTED,
                          "scope controller already connected"};
              }
            } catch (const ScopeControllerError& error) {
              status = scope_error(error);
            }
            if (auto gate = weak.lock()) {
              gate->invoke([&](SessionReactor& reactor) {
                if (!status.ok()) {
                  reactor.finish(status);
                  return;
                }
                state->controller->set_frame_listener([weak] {
                  if (auto listener_gate = weak.lock()) {
                    listener_gate->invoke(
                        [](SessionReactor& value) { value.frame_dirty(); });
                  }
                });
                reactor.acquired_ = true;
                reactor.StartRead(&reactor.request_);
              });
            }
          })) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "scope work queue is full"});
      }
    }
    void OnReadDone(bool ok) override {
      gate_->invoke([ok](SessionReactor& reactor) { reactor.read_done(ok); });
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](SessionReactor& reactor) { reactor.write_done(ok); });
    }
    void OnCancel() override {
      gate_->invoke([](SessionReactor& reactor) {
        reactor.finish(
            {::grpc::StatusCode::CANCELLED, "scope session cancelled"});
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
      finish({::grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }

   private:
    static ScopeConfig decode_config(
        const linuxcnc::v1::ScopeAcquisitionConfig& wire) {
      ScopeConfig config;
      config.thread_name = wire.thread_name();
      config.multiplier = static_cast<int>(wire.multiplier());
      config.pre_trigger = static_cast<int>(wire.pre_trigger());
      config.trigger_channel = static_cast<int>(wire.trigger_channel());
      config.trigger_level = wire.trigger_level();
      config.rising = wire.rising();
      config.automatic = wire.automatic();
      std::array<bool, kScopeChannelCount> assigned{};
      for (const auto& channel : wire.channels()) {
        if (channel.index() >= kScopeChannelCount || assigned[channel.index()])
          throw ScopeControllerError("invalid or duplicate scope channel index",
                                     -EINVAL);
        assigned[channel.index()] = true;
        auto& target = config.channels[channel.index()];
        target.enabled = channel.enabled();
        if (!channel.enabled()) {
          continue;
        }
        if (channel.item().name().empty()) {
          throw ScopeControllerError(
              "enabled scope channel requires a HAL item", -EINVAL);
        }
        target.source.name = channel.item().name();
        switch (channel.item().kind()) {
          case HAL_ITEM_KIND_PIN:
            target.source.kind = ScopeSourceKind::Pin;
            break;
          case HAL_ITEM_KIND_PARAM:
            target.source.kind = ScopeSourceKind::Param;
            break;
          case HAL_ITEM_KIND_SIGNAL:
            target.source.kind = ScopeSourceKind::Signal;
            break;
          default:
            throw ScopeControllerError("unsupported scope HAL item kind",
                                       -EINVAL);
        }
      }
      return config;
    }
    void read_done(bool ok) {
      if (!ok) {
        finish(::grpc::Status::OK);
        return;
      }
      auto request = request_;
      request_.Clear();
      read_paused_ = true;
      const auto state = state_;
      const std::weak_ptr<LifetimeGate<SessionReactor>> weak = gate_;
      if (!service_.worker_.submit([state, weak,
                                    request = std::move(request)]() mutable {
            ::grpc::Status status;
            std::optional<ScopeSessionMessage> response;
            try {
              auto* controller = state->controller;
              switch (request.message_case()) {
                case ScopeSessionMessage::kAcquire:
                  break;
                case ScopeSessionMessage::kConfigure:
                  controller->configure(
                      state->owner,
                      decode_config(request.configure().config()));
                  break;
                case ScopeSessionMessage::kRun: {
                  ScopeRunMode mode;
                  switch (request.run().mode()) {
                    case SCOPE_RUN_MODE_RUN:
                      mode = ScopeRunMode::Run;
                      break;
                    case SCOPE_RUN_MODE_SINGLE:
                      mode = ScopeRunMode::Single;
                      break;
                    case SCOPE_RUN_MODE_ROLL:
                      mode = ScopeRunMode::Roll;
                      break;
                    default:
                      throw ScopeControllerError("scope run mode is required",
                                                 -EINVAL);
                  }
                  controller->run(state->owner, mode);
                  break;
                }
                case ScopeSessionMessage::kStop:
                  controller->stop(state->owner);
                  break;
                case ScopeSessionMessage::kTrigger:
                  controller->trigger(state->owner);
                  break;
                case ScopeSessionMessage::kAck: {
                  if (auto frame = controller->acknowledge(
                          state->owner, request.ack().generation())) {
                    ScopeSessionMessage message;
                    encode_scope_frame(*frame, &message);
                    response = std::move(message);
                  }
                  break;
                }
                default:
                  throw ScopeControllerError(
                      "client sent an invalid scope session message", -EINVAL);
              }
              if (request.message_case() != ScopeSessionMessage::kAck) {
                ScopeSessionMessage message;
                encode_scope_status(controller->status(),
                                    controller->skipped_frames(),
                                    message.mutable_status());
                response = std::move(message);
              }
            } catch (const ScopeControllerError& error) {
              status = scope_error(error);
            }
            if (auto gate = weak.lock()) {
              gate->invoke([&](SessionReactor& reactor) {
                if (!status.ok()) {
                  reactor.finish(status);
                  return;
                }
                if (response) {
                  reactor.offer_control(std::move(*response));
                } else {
                  reactor.read_paused_ = false;
                  reactor.StartRead(&reactor.request_);
                }
              });
            }
          })) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "scope work queue is full"});
      }
    }
    void frame_dirty() {
      frame_dirty_ = true;
      if (writing_ || frame_fetch_scheduled_ || !acquired_) return;
      frame_fetch_scheduled_ = true;
      frame_dirty_ = false;
      const auto state = state_;
      const std::weak_ptr<LifetimeGate<SessionReactor>> weak = gate_;
      if (!service_.worker_.submit([state, weak] {
            auto frame = state->controller->next_frame(state->owner);
            if (auto gate = weak.lock()) {
              gate->invoke([&](SessionReactor& reactor) {
                reactor.frame_fetch_scheduled_ = false;
                if (frame) {
                  ScopeSessionMessage message;
                  encode_scope_frame(*frame, &message);
                  reactor.offer_frame(std::move(message));
                }
                if (reactor.frame_dirty_) reactor.frame_dirty();
              });
            }
          })) {
        frame_fetch_scheduled_ = false;
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "scope work queue is full"});
      }
    }
    void offer_control(ScopeSessionMessage message) {
      pending_control_ = std::move(message);
      pump_write();
    }
    void offer_frame(ScopeSessionMessage message) {
      pending_frame_ = std::move(message);
      pump_write();
    }
    void pump_write() {
      if (writing_) return;
      if (pending_control_) {
        response_ = std::move(*pending_control_);
        pending_control_.reset();
      } else if (pending_frame_) {
        response_ = std::move(*pending_frame_);
        pending_frame_.reset();
      } else {
        return;
      }
      writing_ = true;
      StartWrite(&response_);
    }
    void write_done(bool ok) {
      writing_ = false;
      if (!ok) {
        finish(::grpc::Status::OK);
        return;
      }
      if (pending_control_ || pending_frame_) {
        pump_write();
        return;
      }
      if (frame_dirty_) frame_dirty();
      if (read_paused_ && !pending_control_) {
        read_paused_ = false;
        StartRead(&request_);
      }
    }
    void request_cleanup() {
      if (!admitted_ || state_->cleanup_started.exchange(true)) return;
      const auto state = state_;
      auto* admission = &service_.admission_;
      if (!service_.worker_.submit_cleanup([state, admission] {
            if (state->controller) {
              state->controller->set_frame_listener({});
              state->controller->release(state->owner);
            }
            admission->release();
          })) {
        if (state->controller) {
          state->controller->release(state->owner);
        }
        admission->release();
      }
    }
    void finish(::grpc::Status status) {
      gate_->finish([&](SessionReactor& reactor) {
        reactor.request_cleanup();
        reactor.Finish(status);
      });
    }
    ScopeServiceImpl& service_;
    bool admitted_ = false;
    bool stream_admitted_ = false;
    bool acquired_ = false;
    bool writing_ = false;
    bool read_paused_ = false;
    bool frame_dirty_ = false;
    bool frame_fetch_scheduled_ = false;
    ScopeSessionMessage request_;
    ScopeSessionMessage response_;
    std::optional<ScopeSessionMessage> pending_control_;
    std::optional<ScopeSessionMessage> pending_frame_;
    std::shared_ptr<SessionState> state_;
    std::shared_ptr<LifetimeGate<SessionReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };
  BoundedExecutor& worker_;
  AdmissionCounter& admission_;
  AdmissionCounter& stream_admission_;
  std::unique_ptr<LinuxCncScopeController> controller_;
  const std::chrono::milliseconds poll_period_, heartbeat_period_;
  const std::size_t requested_samples_;
  std::atomic<std::uint64_t> session_sequence_{0};
  ActiveCallbackRegistry callbacks_;
};

}  // namespace

std::unique_ptr<ManagedGrpcService> make_scope_service_impl(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& admission, AdmissionCounter& stream_admission) {
  return std::make_unique<ScopeServiceImpl>(config, worker, admission,
                                            stream_admission);
}

}  // namespace linuxcnc::server::detail
