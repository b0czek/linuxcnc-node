#include <grpcpp/grpcpp.h>

#include <cstdint>
#include <limits>
#include <memory>
#include <string>
#include <utility>

#include "grpc/server/service_factories.hpp"
#include "linuxcnc/v1/ini.grpc.pb.h"
#include "linuxcnc_grpc/linuxcnc/active_ini.hpp"

namespace linuxcnc::server::detail {
namespace {

using namespace linuxcnc::v1;

::grpc::Status validate(const IniValueRequest& request,
                        std::size_t* occurrence) {
  if (request.section().empty() || request.key().empty()) {
    return {::grpc::StatusCode::INVALID_ARGUMENT,
            "INI section and key must be non-empty"};
  }
  if (request.has_occurrence() && request.occurrence() == 0) {
    return {::grpc::StatusCode::INVALID_ARGUMENT,
            "INI occurrence must be one-based"};
  }
  const std::uint32_t selected =
      request.has_occurrence() ? request.occurrence() : 1;
  if (selected > static_cast<std::uint32_t>(std::numeric_limits<int>::max())) {
    return {::grpc::StatusCode::INVALID_ARGUMENT,
            "INI occurrence is outside LinuxCNC's range"};
  }
  *occurrence = selected;
  return ::grpc::Status::OK;
}

::grpc::Status validate(const IniFindAllRequest& request) {
  if (request.section().empty() || request.key().empty()) {
    return {::grpc::StatusCode::INVALID_ARGUMENT,
            "INI section and key must be non-empty"};
  }
  return ::grpc::Status::OK;
}

::grpc::Status conversion_status(IniConversionStatus status) {
  switch (status) {
    case IniConversionStatus::Found:
      return ::grpc::Status::OK;
    case IniConversionStatus::Missing:
      return {::grpc::StatusCode::NOT_FOUND, "INI key was not found"};
    case IniConversionStatus::Invalid:
      return {::grpc::StatusCode::INVALID_ARGUMENT,
              "INI value cannot be converted to the requested type"};
  }
  return {::grpc::StatusCode::INTERNAL, "unknown INI conversion status"};
}

class IniServiceImpl final : public IniService::CallbackService,
                             public ManagedGrpcService {
 public:
  explicit IniServiceImpl(std::shared_ptr<const ActiveIni> ini)
      : ini_(std::move(ini)) {}

  ::grpc::Service* service() noexcept override { return this; }
  void shutdown() override {}

  ::grpc::ServerUnaryReactor* Find(::grpc::CallbackServerContext* context,
                                   const IniValueRequest* request,
                                   IniStringValue* response) override {
    std::size_t occurrence = 0;
    if (auto status = validate(*request, &occurrence); !status.ok())
      return finish(context, status);
    auto value = ini_->find(request->section(), request->key(), occurrence);
    if (!value)
      return finish(context, {::grpc::StatusCode::NOT_FOUND,
                              "INI key was not found"});
    response->set_value(std::move(*value));
    return finish(context, ::grpc::Status::OK);
  }

  ::grpc::ServerUnaryReactor* FindAll(
      ::grpc::CallbackServerContext* context,
      const IniFindAllRequest* request, IniStringValues* response) override {
    if (auto status = validate(*request); !status.ok())
      return finish(context, status);
    for (auto& value : ini_->find_all(request->section(), request->key())) {
      response->add_values(std::move(value));
    }
    return finish(context, ::grpc::Status::OK);
  }

  ::grpc::ServerUnaryReactor* GetBool(::grpc::CallbackServerContext* context,
                                      const IniValueRequest* request,
                                      IniBoolValue* response) override {
    std::size_t occurrence = 0;
    if (auto status = validate(*request, &occurrence); !status.ok())
      return finish(context, status);
    const auto result =
        ini_->get_bool(request->section(), request->key(), occurrence);
    if (auto status = conversion_status(result.status); !status.ok())
      return finish(context, status);
    response->set_value(result.value);
    return finish(context, ::grpc::Status::OK);
  }

  ::grpc::ServerUnaryReactor* GetInt(::grpc::CallbackServerContext* context,
                                     const IniValueRequest* request,
                                     IniIntValue* response) override {
    std::size_t occurrence = 0;
    if (auto status = validate(*request, &occurrence); !status.ok())
      return finish(context, status);
    const auto result =
        ini_->get_int(request->section(), request->key(), occurrence);
    if (auto status = conversion_status(result.status); !status.ok())
      return finish(context, status);
    response->set_value(result.value);
    return finish(context, ::grpc::Status::OK);
  }

  ::grpc::ServerUnaryReactor* GetUInt(::grpc::CallbackServerContext* context,
                                      const IniValueRequest* request,
                                      IniUIntValue* response) override {
    std::size_t occurrence = 0;
    if (auto status = validate(*request, &occurrence); !status.ok())
      return finish(context, status);
    const auto result =
        ini_->get_uint(request->section(), request->key(), occurrence);
    if (auto status = conversion_status(result.status); !status.ok())
      return finish(context, status);
    response->set_value(result.value);
    return finish(context, ::grpc::Status::OK);
  }

  ::grpc::ServerUnaryReactor* GetFloat(::grpc::CallbackServerContext* context,
                                       const IniValueRequest* request,
                                       IniFloatValue* response) override {
    std::size_t occurrence = 0;
    if (auto status = validate(*request, &occurrence); !status.ok())
      return finish(context, status);
    const auto result =
        ini_->get_float(request->section(), request->key(), occurrence);
    if (auto status = conversion_status(result.status); !status.ok())
      return finish(context, status);
    response->set_value(result.value);
    return finish(context, ::grpc::Status::OK);
  }

 private:
  static ::grpc::ServerUnaryReactor* finish(
      ::grpc::CallbackServerContext* context, ::grpc::Status status) {
    auto* reactor = context->DefaultReactor();
    reactor->Finish(std::move(status));
    return reactor;
  }

  const std::shared_ptr<const ActiveIni> ini_;
};

}  // namespace

std::unique_ptr<ManagedGrpcService> make_ini_service(
    std::shared_ptr<const ActiveIni> ini) {
  return std::make_unique<IniServiceImpl>(std::move(ini));
}

}  // namespace linuxcnc::server::detail
