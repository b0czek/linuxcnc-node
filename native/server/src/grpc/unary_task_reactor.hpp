#pragma once

#include "linuxcnc_grpc/callback_runtime.hpp"

#include <grpcpp/grpcpp.h>

#include <functional>
#include <memory>
#include <utility>

namespace linuxcnc::server::detail {

// Runs a blocking unary RPC task on the bounded native executor while keeping
// callback-reactor lifetime and shutdown/cancellation races serialized by the
// transport-neutral LifetimeGate.
template <typename Response>
class UnaryTaskReactor final : public ::grpc::ServerUnaryReactor {
 public:
  using Task = std::function<::grpc::Status(
      const CancellationToken&, Response*)>;

  UnaryTaskReactor(BoundedExecutor& executor, ActiveCallbackRegistry& registry,
                   Response* response, Task task)
      : response_(response),
        gate_(std::make_shared<LifetimeGate<UnaryTaskReactor>>(this)) {
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
          ::grpc::Status status;
          Response response;
          try {
            status = task(*token, &response);
          } catch (const std::exception& error) {
            status = {::grpc::StatusCode::INTERNAL, error.what()};
          } catch (...) {
            status = {::grpc::StatusCode::INTERNAL, "native worker failed"};
          }
          if (token->cancelled()) {
            status = {::grpc::StatusCode::CANCELLED, "RPC cancelled"};
          }
          gate->invoke([&](UnaryTaskReactor& reactor) {
            reactor.complete(std::move(status), std::move(response));
          });
        })) {
      finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
              "blocking work queue is full"});
    }
  }

  void OnCancel() override {
    token_->cancel();
    finish({::grpc::StatusCode::CANCELLED, "RPC cancelled"});
  }

  void OnDone() override {
    gate_->detach();
    registration_.reset();
    delete this;
  }

  void shutdown() {
    token_->cancel();
    finish({::grpc::StatusCode::UNAVAILABLE, "server shutting down"});
  }

 private:
  void complete(::grpc::Status status, Response response) {
    gate_->finish([&](UnaryTaskReactor& reactor) {
      if (status.ok()) *reactor.response_ = std::move(response);
      reactor.Finish(status);
    });
  }

  void finish(::grpc::Status status) {
    gate_->finish([&](UnaryTaskReactor& reactor) { reactor.Finish(status); });
  }

  std::shared_ptr<CancellationToken> token_ =
      std::make_shared<CancellationToken>();
  Response* response_;
  std::shared_ptr<LifetimeGate<UnaryTaskReactor>> gate_;
  ActiveCallbackRegistry::Registration registration_;
};

}  // namespace linuxcnc::server::detail
