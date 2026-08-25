#include <grpcpp/grpcpp.h>

#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include <utility>

#include "scope/grpc/service_impl.hpp"
#include "linuxcnc/v1/scope.grpc.pb.h"
#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/daemon/config.hpp"
#include "linuxcnc_grpc/scope/manager.hpp"

namespace linuxcnc::server::detail {
namespace {

using namespace linuxcnc::v1;

class ScopeServiceImpl final : public ScopeService::CallbackService,
                               public ManagedGrpcService {
 public:
  ::grpc::Service* service() noexcept override { return this; }

  ScopeServiceImpl(const DaemonConfig&, BoundedExecutor& worker,
                   AdmissionCounter& admission,
                   AdmissionCounter& stream_admission)
      : worker_(worker),
        admission_(admission),
        stream_admission_(stream_admission) {}

  void shutdown() override { callbacks_.shutdown(); }

  ::grpc::ServerBidiReactor<ScopeSessionMessage, ScopeSessionMessage>* Session(
      ::grpc::CallbackServerContext* context) override {
    return new SessionReactor(*this, context->peer());
  }

 private:
  class SessionReactor final
      : public ::grpc::ServerBidiReactor<ScopeSessionMessage,
                                         ScopeSessionMessage> {
   public:
    SessionReactor(ScopeServiceImpl& service, std::string owner)
        : service_(service),
          owner_(std::move(owner)),
          admitted_(service_.admission_.acquire()),
          stream_admitted_(service_.stream_admission_.acquire()),
          gate_(std::make_shared<LifetimeGate<SessionReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<SessionReactor>> weak_gate = gate_;
      registration_ = service_.callbacks_.register_callback([weak_gate] {
        if (auto gate = weak_gate.lock())
          gate->invoke([](SessionReactor& reactor) { reactor.shutdown(); });
      });
      if (!registration_) {
        shutdown();
        return;
      }
      if (!admitted_ || !stream_admitted_ ||
          !service_.manager_.acquire(owner_)) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
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
        if (!ok)
          reactor.finish(::grpc::Status::OK);
        else
          reactor.StartRead(&reactor.request_);
      });
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
      cleanup();
      if (admitted_) service_.admission_.release();
      if (stream_admitted_) service_.stream_admission_.release();
      delete this;
    }
    void shutdown() {
      cleanup();
      finish({::grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }

   private:
    void read_done(bool ok) {
      if (!ok) {
        finish(::grpc::Status::OK);
        return;
      }
      auto request = request_;
      request_.Clear();
      const std::weak_ptr<LifetimeGate<SessionReactor>> weak_gate = gate_;
      if (!service_.worker_.submit(
              [weak_gate, request = std::move(request)]() mutable {
                auto gate = weak_gate.lock();
                if (gate) {
                  gate->invoke([&](SessionReactor& reactor) {
                    reactor.consume(request);
                  });
                }
              })) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "scope work queue is full"});
      }
    }
    void consume(const ScopeSessionMessage& request) {
      response_.Clear();
      if (request.message_case() == ScopeSessionMessage::kAcquire) {
        response_.mutable_status()->set_state(SCOPE_RUNTIME_STATE_IDLE);
      } else if (request.message_case() == ScopeSessionMessage::kAck) {
        const auto next =
            service_.manager_.acknowledge(owner_, request.ack().generation());
        if (!next) {
          StartRead(&request_);
          return;
        }
        auto* status = response_.mutable_status();
        status->set_state(SCOPE_RUNTIME_STATE_IDLE);
        status->set_generation(next->generation);
        status->set_skipped_frames(next->skipped_frames);
      } else if (request.message_case() == ScopeSessionMessage::kStop) {
        finish(::grpc::Status::OK);
        return;
      } else {
        StartRead(&request_);
        return;
      }
      writing_ = true;
      StartWrite(&response_);
    }
    void cleanup() {
      if (acquired_ && !cleaned_.exchange(true))
        service_.manager_.release(owner_);
    }
    void finish(::grpc::Status status) {
      gate_->finish([&](SessionReactor& reactor) {
        reactor.cleanup();
        reactor.Finish(status);
      });
    }
    ScopeServiceImpl& service_;
    std::string owner_;
    bool admitted_ = false;
    bool stream_admitted_ = false;
    bool acquired_ = false;
    bool writing_ = false;
    ScopeSessionMessage request_;
    ScopeSessionMessage response_;
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

}  // namespace

std::unique_ptr<ManagedGrpcService> make_scope_service_impl(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& admission, AdmissionCounter& stream_admission) {
  return std::make_unique<ScopeServiceImpl>(config, worker, admission,
                                            stream_admission);
}

}  // namespace linuxcnc::server::detail
