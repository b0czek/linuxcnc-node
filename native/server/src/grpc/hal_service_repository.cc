#include "grpc/hal_service_internal.hpp"

#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/daemon_config.hpp"
#include "linuxcnc_grpc/hal_repository.hpp"

#include <atomic>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace linuxcnc::server::detail {
namespace {

::grpc::Status Unimplemented(const std::string& message) {
  return {::grpc::StatusCode::UNIMPLEMENTED, message};
}

std::optional<HalValue> decode_hal_value(const HalScalar& scalar) {
  switch (scalar.type()) {
    case HAL_TYPE_BIT:
      if (scalar.value_case() == HalScalar::kBit) return scalar.bit();
      break;
    case HAL_TYPE_FLOAT:
      if (scalar.value_case() == HalScalar::kFloatValue)
        return scalar.float_value();
      break;
    case HAL_TYPE_S32:
      if (scalar.value_case() == HalScalar::kS32) return scalar.s32();
      break;
    case HAL_TYPE_U32:
      if (scalar.value_case() == HalScalar::kU32) return scalar.u32();
      break;
    case HAL_TYPE_S64:
      if (scalar.value_case() == HalScalar::kS64) return scalar.s64();
      break;
    case HAL_TYPE_U64:
      if (scalar.value_case() == HalScalar::kU64) return scalar.u64();
      break;
    default: break;
  }
  return std::nullopt;
}

void encode_hal_value(const HalValue& value, HalScalar* scalar) {
  if (const auto* item = std::get_if<bool>(&value)) {
    scalar->set_type(HAL_TYPE_BIT);
    scalar->set_bit(*item);
  } else if (const auto* item = std::get_if<double>(&value)) {
    scalar->set_type(HAL_TYPE_FLOAT);
    scalar->set_float_value(*item);
  } else if (const auto* item = std::get_if<std::int32_t>(&value)) {
    scalar->set_type(HAL_TYPE_S32);
    scalar->set_s32(*item);
  } else if (const auto* item = std::get_if<std::uint32_t>(&value)) {
    scalar->set_type(HAL_TYPE_U32);
    scalar->set_u32(*item);
  } else if (const auto* item = std::get_if<std::int64_t>(&value)) {
    scalar->set_type(HAL_TYPE_S64);
    scalar->set_s64(*item);
  } else if (const auto* item = std::get_if<std::uint64_t>(&value)) {
    scalar->set_type(HAL_TYPE_U64);
    scalar->set_u64(*item);
  }
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

class HalServiceImpl final : public HalUnaryService, public ManagedGrpcService {
 public:
  ::grpc::Service* service() noexcept override { return this; }

  HalServiceImpl(const DaemonConfig&, BoundedExecutor& worker,
                 AdmissionCounter& component_admission,
                 AdmissionCounter& stream_admission)
      : HalUnaryService(worker), worker_(worker),
        component_admission_(component_admission),
        stream_admission_(stream_admission) {}

  void shutdown() override {
    topology_wakes_.close();
    shutdown_callbacks();
  }

  ::grpc::ServerWriteReactor<WatchHalTopologyEvent>* WatchTopology(
      ::grpc::CallbackServerContext*,
      const WatchHalTopologyRequest* request) override {
    return new TopologyReactor(*this, request->after_sequence());
  }

  ::grpc::Status do_get_topology(const GetHalTopologyRequest*,
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
    return ::grpc::Status::OK;
  }

  ::grpc::Status do_read(const HalReadRequest* request,
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
    return ::grpc::Status::OK;
  }

  ::grpc::Status do_write(const HalWrite* request,
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
    return ::grpc::Status::OK;
  }

  ::grpc::Status do_create_signal(const CreateHalSignalRequest* request,
                                  CreateHalSignalResponse* response) override {
    if (request->name().empty()) return Invalid("signal name is required");
    const auto type = static_cast<HalType>(request->type());
    HalItem item{request->name(), static_cast<HalScalarType>(type - HAL_TYPE_BIT),
                 false, true, default_hal_value(type)};
    if (!repository_.add_item(item)) {
      return Invalid("signal already exists or has invalid type");
    }
    topology_wakes_.publish(repository_.generation());
    auto* signal = response->mutable_signal();
    signal->set_name(item.name);
    signal->set_type(type);
    encode_hal_value(item.value, signal->mutable_value());
    return ::grpc::Status::OK;
  }

  ::grpc::Status do_set_message_level(const SetHalMessageLevelRequest*,
                                       google::protobuf::Empty*) override {
    return Unimplemented("HAL message-level adapter is not linked");
  }

  ::grpc::Status do_get_writer_metadata(const GetHalWriterMetadataRequest*,
                                        GetHalWriterMetadataResponse* response) override {
    response->mutable_metadata()->set_writer_id(writer_id_);
    response->mutable_metadata()->set_ready(ready_);
    return ::grpc::Status::OK;
  }

  ::grpc::Status do_set_writer_ready(const SetHalWriterReadyRequest* request,
                                     google::protobuf::Empty*) override {
    (void)request;
    return Unimplemented("HAL writer-ready adapter is not linked");
  }

  ::grpc::ServerBidiReactor<ComponentSessionMessage, ComponentSessionMessage>*
  ComponentSession(::grpc::CallbackServerContext*) override {
    return new ComponentReactor(*this);
  }

 private:
  class TopologyReactor final
      : public ::grpc::ServerWriteReactor<WatchHalTopologyEvent> {
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
      if (!registration_) {
        shutdown();
        return;
      }
      if (!admitted_) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "stream admission limit reached"});
        return;
      }
      subscription_ = service_.topology_wakes_.subscribe([weak](const std::uint64_t&) {
        auto gate = weak.lock();
        if (gate) {
          gate->invoke([](TopologyReactor& reactor) {
            reactor.schedule();
          });
        }
      });
      schedule();
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](TopologyReactor& reactor) {
        reactor.writing_ = false;
        if (!ok) reactor.finish(::grpc::Status::OK);
        else reactor.schedule();
      });
    }
    void OnCancel() override {
      gate_->invoke([](TopologyReactor& reactor) {
        reactor.finish({::grpc::StatusCode::CANCELLED,
                        "topology stream cancelled"});
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
    void schedule() {
      if (writing_ || gate_->state() != LifetimeGate<TopologyReactor>::State::Open ||
          scheduled_.exchange(true)) return;
      const std::weak_ptr<LifetimeGate<TopologyReactor>> weak = gate_;
      if (!service_.worker_.submit([weak] {
            auto gate = weak.lock();
            if (gate) {
              gate->invoke([](TopologyReactor& reactor) {
                reactor.scheduled_ = false;
                reactor.emit();
              });
            }
          })) {
        scheduled_ = false;
        finish(service_.worker_.accepting()
                   ? ::grpc::Status(::grpc::StatusCode::RESOURCE_EXHAUSTED,
                                  "HAL work queue is full")
                   : ::grpc::Status(::grpc::StatusCode::UNAVAILABLE,
                                  "server shutting down"));
      }
    }
    void emit() {
      const auto topology = service_.repository_.topology();
      if (topology.generation == sequence_) return;
      message_.Clear();
      message_.set_sequence(topology.generation);
      for (const auto& item : topology.items) {
        auto* pin = item.pin ? message_.mutable_topology()->add_pins() : nullptr;
        auto* param = item.pin ? nullptr : message_.mutable_topology()->add_params();
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
      sequence_ = topology.generation;
      writing_ = true;
      StartWrite(&message_);
    }
    void finish(::grpc::Status status) {
      gate_->finish([&](TopologyReactor& reactor) {
        reactor.subscription_.reset();
        reactor.Finish(status);
      });
    }
    HalServiceImpl& service_;
    bool admitted_ = false;
    bool writing_ = false;
    std::uint64_t sequence_ = 0;
    WatchHalTopologyEvent message_;
    std::atomic<bool> scheduled_{false};
    SubscriptionHub<std::uint64_t>::Subscription subscription_;
    std::shared_ptr<LifetimeGate<TopologyReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };

  class ComponentReactor final
      : public ::grpc::ServerBidiReactor<ComponentSessionMessage,
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
      if (!registration_) {
        shutdown();
        return;
      }
      if (!admitted_ || !stream_admitted_) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "component or stream admission limit reached"});
      } else {
        StartRead(&request_);
      }
    }
    void OnReadDone(bool ok) override {
      gate_->invoke([ok](ComponentReactor& reactor) {
        reactor.read_done(ok);
      });
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](ComponentReactor& reactor) {
        reactor.write_done(ok);
      });
    }
    void OnCancel() override {
      gate_->invoke([](ComponentReactor& reactor) {
        reactor.finish({::grpc::StatusCode::CANCELLED,
                        "component cancelled"});
      });
    }
    void OnDone() override {
      gate_->detach();
      cleanup();
      registration_.reset();
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
      const std::weak_ptr<LifetimeGate<ComponentReactor>> weak_gate = gate_;
      if (!service_.worker_.submit([weak_gate, request = std::move(request)]() mutable {
            auto gate = weak_gate.lock();
            if (gate) {
              gate->invoke([&](ComponentReactor& reactor) {
                reactor.consume(request);
              });
            }
          })) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "HAL work queue is full"});
      }
    }
    void consume(const ComponentSessionMessage& request) {
      ::grpc::Status error;
      bool respond = false;
      switch (request.message_case()) {
        case ComponentSessionMessage::kOpen:
          prefix_ = request.open().prefix().empty()
                        ? request.open().name()
                        : request.open().prefix();
          writer_id_ = request.open().name();
          response_.Clear();
          response_.mutable_metadata()->set_writer_id(request.open().name());
          response_.mutable_metadata()->set_ready(false);
          respond = true;
          break;
        case ComponentSessionMessage::kPin: {
          const auto& pin = request.pin();
          const auto name = prefix_ + "." + pin.name();
          const auto type = static_cast<HalType>(pin.type());
          if (!service_.repository_.add_item(HalItem{
                  name, static_cast<HalScalarType>(type - HAL_TYPE_BIT), true,
                  pin.direction() != HAL_PIN_DIRECTION_IN,
                  default_hal_value(type)})) {
            error = Invalid("pin rejected");
          } else {
            owned_.push_back(name);
          }
          service_.topology_wakes_.publish(service_.repository_.generation());
          break;
        }
        case ComponentSessionMessage::kParameter: {
          const auto& value = request.parameter();
          const auto name = prefix_ + "." + value.name();
          const auto type = static_cast<HalType>(value.type());
          if (!service_.repository_.add_item(HalItem{
                  name, static_cast<HalScalarType>(type - HAL_TYPE_BIT), false,
                  value.direction() == HAL_PARAM_DIRECTION_RW,
                  default_hal_value(type)})) {
            error = Invalid("parameter rejected");
          } else {
            owned_.push_back(name);
          }
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
          if (!value || !service_.repository_.write(
                            request.value().item().name(), *value)) {
            error = Invalid("component value rejected");
          } else {
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
        case ComponentSessionMessage::kClose:
          finish(::grpc::Status::OK);
          return;
        default:
          error = Invalid("component message required");
          break;
      }
      if (!error.ok()) {
        finish(error);
        return;
      }
      if (respond) {
        writing_ = true;
        StartWrite(&response_);
      } else {
        StartRead(&request_);
      }
    }
    void write_done(bool ok) {
      writing_ = false;
      if (!ok) finish(::grpc::Status::OK);
      else StartRead(&request_);
    }
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
    void finish(::grpc::Status status) {
      gate_->finish([&](ComponentReactor& reactor) {
        reactor.cleanup();
        reactor.Finish(status);
      });
    }
    HalServiceImpl& service_;
    bool admitted_ = false;
    bool stream_admitted_ = false;
    bool writing_ = false;
    std::string prefix_;
    std::string writer_id_;
    std::vector<std::string> owned_;
    std::uint64_t sequence_ = 0;
    ComponentSessionMessage request_;
    ComponentSessionMessage response_;
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

}  // namespace

std::unique_ptr<ManagedGrpcService> make_hal_service_impl(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& component_admission,
    AdmissionCounter& stream_admission) {
  return std::make_unique<HalServiceImpl>(
      config, worker, component_admission, stream_admission);
}

}  // namespace linuxcnc::server::detail
