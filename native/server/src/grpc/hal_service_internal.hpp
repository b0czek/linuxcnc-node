#pragma once

#include <google/protobuf/empty.pb.h>
#include <grpcpp/grpcpp.h>

#include <memory>
#include <string>

#include "grpc/hal_service_impl.hpp"
#include "grpc/unary_task_reactor.hpp"
#include "linuxcnc/v1/hal.grpc.pb.h"
#include "linuxcnc_grpc/callback_runtime.hpp"

namespace linuxcnc::server::detail {
namespace {

using namespace linuxcnc::v1;

::grpc::Status Invalid(const std::string& message) {
  return {::grpc::StatusCode::INVALID_ARGUMENT, message};
}

using HalUnaryCallbackBase = HalService::CallbackService;

class HalUnaryService : public HalUnaryCallbackBase {
 public:
  explicit HalUnaryService(BoundedExecutor& worker) : worker_(worker) {}
  ::grpc::ServerUnaryReactor* GetTopology(
      ::grpc::CallbackServerContext*, const GetHalTopologyRequest* request,
      GetHalTopologyResponse* response) override {
    return task(request, response, &HalUnaryService::do_get_topology);
  }
  ::grpc::ServerUnaryReactor* Read(::grpc::CallbackServerContext*,
                                   const HalReadRequest* request,
                                   HalReadResponse* response) override {
    return task(request, response, &HalUnaryService::do_read);
  }
  ::grpc::ServerUnaryReactor* Write(::grpc::CallbackServerContext*,
                                    const HalWrite* request,
                                    HalWriteResponse* response) override {
    return task(request, response, &HalUnaryService::do_write);
  }
  ::grpc::ServerUnaryReactor* CreateValueSubscription(
      ::grpc::CallbackServerContext*,
      const CreateHalValueSubscriptionRequest* request,
      HalValueSubscription* response) override {
    return task(request, response,
                &HalUnaryService::do_create_value_subscription);
  }
  ::grpc::ServerUnaryReactor* UpdateValueSubscription(
      ::grpc::CallbackServerContext*,
      const UpdateHalValueSubscriptionRequest* request,
      HalValueSubscription* response) override {
    return task(request, response,
                &HalUnaryService::do_update_value_subscription);
  }
  ::grpc::ServerUnaryReactor* DeleteValueSubscription(
      ::grpc::CallbackServerContext*,
      const DeleteHalValueSubscriptionRequest* request,
      google::protobuf::Empty* response) override {
    return task(request, response,
                &HalUnaryService::do_delete_value_subscription);
  }
  ::grpc::ServerUnaryReactor* CreateSignal(
      ::grpc::CallbackServerContext*, const CreateHalSignalRequest* request,
      CreateHalSignalResponse* response) override {
    return task(request, response, &HalUnaryService::do_create_signal);
  }
  ::grpc::ServerUnaryReactor* SetMessageLevel(
      ::grpc::CallbackServerContext*, const SetHalMessageLevelRequest* request,
      google::protobuf::Empty* response) override {
    return task(request, response, &HalUnaryService::do_set_message_level);
  }
  ::grpc::ServerUnaryReactor* GetWriterMetadata(
      ::grpc::CallbackServerContext*,
      const GetHalWriterMetadataRequest* request,
      GetHalWriterMetadataResponse* response) override {
    return task(request, response, &HalUnaryService::do_get_writer_metadata);
  }
  ::grpc::ServerUnaryReactor* SetWriterReady(
      ::grpc::CallbackServerContext*, const SetHalWriterReadyRequest* request,
      google::protobuf::Empty* response) override {
    return task(request, response, &HalUnaryService::do_set_writer_ready);
  }

 protected:
  ActiveCallbackRegistry& callback_registry() { return callbacks_; }
  void shutdown_callbacks() { callbacks_.shutdown(); }
  virtual ::grpc::Status do_get_topology(const GetHalTopologyRequest*,
                                         GetHalTopologyResponse*) = 0;
  virtual ::grpc::Status do_read(const HalReadRequest*, HalReadResponse*) = 0;
  virtual ::grpc::Status do_write(const HalWrite*, HalWriteResponse*) = 0;
  virtual ::grpc::Status do_create_value_subscription(
      const CreateHalValueSubscriptionRequest*, HalValueSubscription*) = 0;
  virtual ::grpc::Status do_update_value_subscription(
      const UpdateHalValueSubscriptionRequest*, HalValueSubscription*) = 0;
  virtual ::grpc::Status do_delete_value_subscription(
      const DeleteHalValueSubscriptionRequest*, google::protobuf::Empty*) = 0;
  virtual ::grpc::Status do_create_signal(const CreateHalSignalRequest*,
                                          CreateHalSignalResponse*) = 0;
  virtual ::grpc::Status do_set_message_level(const SetHalMessageLevelRequest*,
                                              google::protobuf::Empty*) = 0;
  virtual ::grpc::Status do_get_writer_metadata(
      const GetHalWriterMetadataRequest*, GetHalWriterMetadataResponse*) = 0;
  virtual ::grpc::Status do_set_writer_ready(const SetHalWriterReadyRequest*,
                                             google::protobuf::Empty*) = 0;

 private:
  template <typename Request, typename Response>
  ::grpc::ServerUnaryReactor* task(
      const Request* request, Response* response,
      ::grpc::Status (HalUnaryService::*method)(const Request*, Response*)) {
    auto owned_request = std::make_shared<Request>(*request);
    return new detail::UnaryTaskReactor<Response>(
        worker_, callbacks_, response,
        [this, owned_request = std::move(owned_request), method](
            const CancellationToken& token, Response* task_response) {
          if (token.cancelled()) {
            return ::grpc::Status(::grpc::StatusCode::CANCELLED,
                                  "RPC cancelled");
          }
          return (this->*method)(owned_request.get(), task_response);
        });
  }

  BoundedExecutor& worker_;
  ActiveCallbackRegistry callbacks_;
};

}  // namespace
}  // namespace linuxcnc::server::detail
