#include <grpcpp/grpcpp.h>

#include <memory>
#include <utility>

#include "grpc/server/service_factories.hpp"
#include "linuxcnc/v1/ini.grpc.pb.h"
#include "linuxcnc_grpc/linuxcnc/active_ini.hpp"

namespace linuxcnc::server::detail {
namespace {
class IniServiceImpl final : public linuxcnc::v1::IniService::CallbackService,
                             public ManagedGrpcService {
 public:
  explicit IniServiceImpl(std::shared_ptr<const ActiveIni> ini)
      : ini_(std::move(ini)) {}
  ::grpc::Service* service() noexcept override { return this; }
  void shutdown() override {}
  ::grpc::ServerUnaryReactor* Read(
      ::grpc::CallbackServerContext* context, const google::protobuf::Empty*,
      linuxcnc::v1::IniSnapshot* response) override {
    for (const auto& entry : ini_->entries()) {
      auto* value = response->add_entries();
      value->set_section(entry.section);
      value->set_key(entry.key);
      value->set_value(entry.value);
    }
    auto* reactor = context->DefaultReactor();
    reactor->Finish(::grpc::Status::OK);
    return reactor;
  }

 private:
  const std::shared_ptr<const ActiveIni> ini_;
};
}  // namespace
std::unique_ptr<ManagedGrpcService> make_ini_service(
    std::shared_ptr<const ActiveIni> ini) {
  return std::make_unique<IniServiceImpl>(std::move(ini));
}
}  // namespace linuxcnc::server::detail
