#include "grpc/service_factories.hpp"
#include "grpc/unary_task_reactor.hpp"

#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/grpc_hal_mapping.hpp"
#include "linuxcnc_grpc/hal_repository.hpp"
#include "linuxcnc/v1/linuxcnc.grpc.pb.h"
#include <google/protobuf/empty.pb.h>
#include <grpcpp/grpcpp.h>

#ifdef LINUXCNC_GRPC_HAS_HAL
#include "linuxcnc_grpc/hal_adapter.hpp"
#endif

#include <algorithm>
#include <array>
#include <atomic>
#include <cerrno>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace linuxcnc::server::detail {
namespace {

using namespace linuxcnc::v1;

::grpc::Status Invalid(const std::string& message) {
  return {::grpc::StatusCode::INVALID_ARGUMENT, message};
}

#ifndef LINUXCNC_GRPC_HAS_RS274
::grpc::Status Unimplemented(const std::string& message) {
  return {::grpc::StatusCode::UNIMPLEMENTED, message};
}
#endif

#ifndef LINUXCNC_GRPC_HAS_HAL
std::optional<HalValue> decode_hal_value(const HalScalar& scalar) {
  switch (scalar.type()) {
    case HAL_TYPE_BIT: if (scalar.value_case() == HalScalar::kBit) return scalar.bit(); break;
    case HAL_TYPE_FLOAT: if (scalar.value_case() == HalScalar::kFloatValue) return scalar.float_value(); break;
    case HAL_TYPE_S32: if (scalar.value_case() == HalScalar::kS32) return scalar.s32(); break;
    case HAL_TYPE_U32: if (scalar.value_case() == HalScalar::kU32) return scalar.u32(); break;
    case HAL_TYPE_S64: if (scalar.value_case() == HalScalar::kS64) return scalar.s64(); break;
    case HAL_TYPE_U64: if (scalar.value_case() == HalScalar::kU64) return scalar.u64(); break;
    default: break;
  }
  return std::nullopt;
}

void encode_hal_value(const HalValue& value, HalScalar* scalar) {
  if (const auto* item = std::get_if<bool>(&value)) { scalar->set_type(HAL_TYPE_BIT); scalar->set_bit(*item); }
  else if (const auto* item = std::get_if<double>(&value)) { scalar->set_type(HAL_TYPE_FLOAT); scalar->set_float_value(*item); }
  else if (const auto* item = std::get_if<std::int32_t>(&value)) { scalar->set_type(HAL_TYPE_S32); scalar->set_s32(*item); }
  else if (const auto* item = std::get_if<std::uint32_t>(&value)) { scalar->set_type(HAL_TYPE_U32); scalar->set_u32(*item); }
  else if (const auto* item = std::get_if<std::int64_t>(&value)) { scalar->set_type(HAL_TYPE_S64); scalar->set_s64(*item); }
  else if (const auto* item = std::get_if<std::uint64_t>(&value)) { scalar->set_type(HAL_TYPE_U64); scalar->set_u64(*item); }
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
#endif

#ifdef LINUXCNC_GRPC_HAS_HAL

::grpc::Status hal_error(const HalAdapterError& error) {
  const auto code = error.code() == -ENOENT ? ::grpc::StatusCode::NOT_FOUND
      : error.code() == -EBUSY ? ::grpc::StatusCode::RESOURCE_EXHAUSTED
      : error.code() == -EINVAL ? ::grpc::StatusCode::INVALID_ARGUMENT
                                : ::grpc::StatusCode::FAILED_PRECONDITION;
  return {code, error.what()};
}

std::optional<HalAdapterType> decode_hal_type(HalType type) {
  if (type < HAL_TYPE_BIT || type > HAL_TYPE_U64) return std::nullopt;
  return static_cast<HalAdapterType>(static_cast<int>(type) - 1);
}
#endif

using HalUnaryCallbackBase = HalService::CallbackService;

class HalUnaryService : public HalUnaryCallbackBase {
 public:
  explicit HalUnaryService(BoundedExecutor& worker) : worker_(worker) {}
  ::grpc::ServerUnaryReactor* GetTopology(::grpc::CallbackServerContext*, const GetHalTopologyRequest* q, GetHalTopologyResponse* r) override { return task(q, r, &HalUnaryService::do_get_topology); }
  ::grpc::ServerUnaryReactor* Read(::grpc::CallbackServerContext*, const HalReadRequest* q, HalReadResponse* r) override { return task(q, r, &HalUnaryService::do_read); }
  ::grpc::ServerUnaryReactor* Write(::grpc::CallbackServerContext*, const HalWrite* q, HalWriteResponse* r) override { return task(q, r, &HalUnaryService::do_write); }
  ::grpc::ServerUnaryReactor* CreateSignal(::grpc::CallbackServerContext*, const CreateHalSignalRequest* q, CreateHalSignalResponse* r) override { return task(q, r, &HalUnaryService::do_create_signal); }
  ::grpc::ServerUnaryReactor* SetMessageLevel(::grpc::CallbackServerContext*, const SetHalMessageLevelRequest* q, google::protobuf::Empty* r) override { return task(q, r, &HalUnaryService::do_set_message_level); }
  ::grpc::ServerUnaryReactor* GetWriterMetadata(::grpc::CallbackServerContext*, const GetHalWriterMetadataRequest* q, GetHalWriterMetadataResponse* r) override { return task(q, r, &HalUnaryService::do_get_writer_metadata); }
  ::grpc::ServerUnaryReactor* SetWriterReady(::grpc::CallbackServerContext*, const SetHalWriterReadyRequest* q, google::protobuf::Empty* r) override { return task(q, r, &HalUnaryService::do_set_writer_ready); }
 protected:
  ActiveCallbackRegistry& callback_registry() { return callbacks_; }
  void shutdown_callbacks() { callbacks_.shutdown(); }
  virtual ::grpc::Status do_get_topology(const GetHalTopologyRequest*, GetHalTopologyResponse*) = 0;
  virtual ::grpc::Status do_read(const HalReadRequest*, HalReadResponse*) = 0;
  virtual ::grpc::Status do_write(const HalWrite*, HalWriteResponse*) = 0;
  virtual ::grpc::Status do_create_signal(const CreateHalSignalRequest*, CreateHalSignalResponse*) = 0;
  virtual ::grpc::Status do_set_message_level(const SetHalMessageLevelRequest*, google::protobuf::Empty*) = 0;
  virtual ::grpc::Status do_get_writer_metadata(const GetHalWriterMetadataRequest*, GetHalWriterMetadataResponse*) = 0;
  virtual ::grpc::Status do_set_writer_ready(const SetHalWriterReadyRequest*, google::protobuf::Empty*) = 0;
 private:
  template <typename Request, typename Response>
  ::grpc::ServerUnaryReactor* task(const Request* request, Response* response,
      ::grpc::Status (HalUnaryService::*method)(const Request*, Response*)) {
    auto owned_request = std::make_shared<Request>(*request);
    return new detail::UnaryTaskReactor<Response>(worker_, callbacks_, response,
        [this, owned_request = std::move(owned_request), method](
            const CancellationToken& token, Response* task_response) {
      if (token.cancelled()) return ::grpc::Status(::grpc::StatusCode::CANCELLED, "RPC cancelled");
      return (this->*method)(owned_request.get(), task_response);
    });
  }
  BoundedExecutor& worker_;
  ActiveCallbackRegistry callbacks_;
};

#ifdef LINUXCNC_GRPC_HAS_HAL
class HalServiceImpl final : public HalUnaryService, public ManagedGrpcService {
  class TopologyReactor;
  class ComponentReactor;

 public:
  ::grpc::Service* service() noexcept override { return this; }

  HalServiceImpl(const DaemonConfig& config, BoundedExecutor& worker,
                 AdmissionCounter& component_admission,
                 AdmissionCounter& stream_admission)
      : HalUnaryService(worker), worker_(worker),
        component_admission_(component_admission),
        stream_admission_(stream_admission),
        topology_period_(config.topology_period),
        timer_([this] { timer_loop(); }) {}

  ~HalServiceImpl() override { shutdown(); }

  void shutdown() override {
    if (stopping_.exchange(true)) return;
    topology_wakes_.close();
    shutdown_callbacks();
    timer_condition_.notify_all();
    if (timer_.joinable()) timer_.join();
  }

  ::grpc::Status do_get_topology(const GetHalTopologyRequest*,
                           GetHalTopologyResponse* response) override {
    try {
      auto [sequence, topology] = topology_snapshot();
      response->set_sequence(sequence);
      *response->mutable_topology() = std::move(topology);
      return ::grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  ::grpc::ServerWriteReactor<WatchHalTopologyEvent>* WatchTopology(
      ::grpc::CallbackServerContext*, const WatchHalTopologyRequest* request) override {
    return new TopologyReactor(*this, request->after_sequence());
  }

  ::grpc::Status do_read(const HalReadRequest* request,
                    HalReadResponse* response) override {
    try {
      std::vector<HalAdapterReference> references;
      references.reserve(request->items_size());
      for (const auto& item : request->items()) {
        auto decoded = decode_hal_reference(item);
        if (!decoded) return Invalid("HAL read contains an invalid item reference");
        references.push_back(std::move(*decoded));
      }
      const auto values = adapter_.read_many(references);
      for (std::size_t index = 0; index < values.size(); ++index) {
        if (!values[index]) {
          return {::grpc::StatusCode::NOT_FOUND,
                  "HAL item '" + references[index].name + "' was not found"};
        }
        auto* encoded = response->add_values();
        *encoded->mutable_item() = request->items(static_cast<int>(index));
        encode_hal_scalar(*values[index], encoded->mutable_value());
      }
      return ::grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  ::grpc::Status do_write(const HalWrite* request,
                     HalWriteResponse* response) override {
    try {
      for (const auto& write : request->writes()) {
        auto reference = decode_hal_reference(write.item());
        auto value = decode_hal_scalar(write.value());
        if (!reference || !value) {
          return Invalid("HAL write contains a mismatched reference or scalar oneof");
        }
        HalAdapterValue written;
        if (!adapter_.write(*reference, *value, &written)) {
          return {::grpc::StatusCode::FAILED_PRECONDITION,
                  "HAL item '" + reference->name + "' is missing, mistyped, or not writable"};
        }
        auto* encoded = response->add_values();
        *encoded->mutable_item() = write.item();
        encode_hal_scalar(written, encoded->mutable_value());
      }
      return ::grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  ::grpc::Status do_create_signal(const CreateHalSignalRequest* request,
                            CreateHalSignalResponse* response) override {
    const auto type = decode_hal_type(request->type());
    if (request->name().empty() || !type) return Invalid("signal name and type are required");
    try {
      if (!adapter_.create_signal(request->name(), *type)) {
        return Invalid("HAL signal was rejected");
      }
      const auto topology = adapter_.topology();
      const auto found = std::find_if(topology.signals.begin(), topology.signals.end(),
                                     [&](const auto& signal) {
                                       return signal.name == request->name();
                                     });
      if (found == topology.signals.end()) {
        return {::grpc::StatusCode::INTERNAL, "created HAL signal is not visible"};
      }
      HalAdapterTopology one;
      one.signals.push_back(*found);
      linuxcnc::v1::HalTopology encoded;
      encode_hal_topology(one, &encoded);
      *response->mutable_signal() = encoded.signals(0);
      return ::grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  ::grpc::Status do_set_message_level(
                               const SetHalMessageLevelRequest* request,
                               google::protobuf::Empty*) override {
    if (request->level() < RTAPI_MESSAGE_LEVEL_NONE ||
        request->level() > RTAPI_MESSAGE_LEVEL_ALL) {
      return Invalid("HAL message level is required");
    }
    try {
      adapter_.set_message_level(static_cast<int>(request->level()) - 1);
      return ::grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  ::grpc::Status do_get_writer_metadata(const GetHalWriterMetadataRequest*,
                                 GetHalWriterMetadataResponse* response) override {
    response->mutable_metadata()->set_writer_id("linuxcnc-grpc-server");
    response->mutable_metadata()->set_ready(writer_ready_.load(std::memory_order_relaxed));
    return ::grpc::Status::OK;
  }

  ::grpc::Status do_set_writer_ready(const SetHalWriterReadyRequest* request,
                              google::protobuf::Empty*) override {
    writer_ready_.store(request->ready(), std::memory_order_relaxed);
    return ::grpc::Status::OK;
  }

  ::grpc::ServerBidiReactor<ComponentSessionMessage, ComponentSessionMessage>*
  ComponentSession(::grpc::CallbackServerContext*) override {
    return new ComponentReactor(*this);
  }

 private:
  struct ComponentState {
    struct Item {
      std::string suffix;
      HalItemKind kind = HAL_ITEM_KIND_PIN;
      std::string full_name;
      std::optional<HalAdapterValue> previous;
    };
    std::unique_ptr<LinuxCncHalComponent> component;
    std::vector<Item> items;
    std::uint64_t sequence = 0;
    bool ready = false;
    std::atomic<bool> cleanup_started{false};
  };

  class TopologyReactor final
      : public ::grpc::ServerWriteReactor<WatchHalTopologyEvent> {
   public:
    TopologyReactor(HalServiceImpl& service, std::uint64_t after)
        : service_(service), after_(after),
          admitted_(service_.stream_admission_.acquire()),
          gate_(std::make_shared<LifetimeGate<TopologyReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<TopologyReactor>> weak = gate_;
      registration_ = service_.callback_registry().register_callback([weak] {
        if (auto gate = weak.lock()) gate->invoke([](TopologyReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "stream admission limit reached"});
        return;
      }
      subscription_ = service_.topology_wakes_.subscribe([weak](const std::uint64_t&) {
        if (auto gate = weak.lock())
          gate->invoke([](TopologyReactor& reactor) { reactor.schedule(); });
      });
      schedule();
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](TopologyReactor& reactor) {
        reactor.writing_ = false;
        if (!ok) reactor.finish(::grpc::Status::OK);
        else { reactor.after_ = reactor.writing_sequence_; reactor.schedule(); }
      });
    }
    void OnCancel() override {
      gate_->invoke([](TopologyReactor& reactor) {
        reactor.finish({::grpc::StatusCode::CANCELLED, "topology stream cancelled"});
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
      if (writing_ || scheduled_ ||
          gate_->state() != LifetimeGate<TopologyReactor>::State::Open) return;
      scheduled_ = true;
      const std::weak_ptr<LifetimeGate<TopologyReactor>> weak = gate_;
      if (!service_.worker_.submit([weak, service = &service_] {
            ::grpc::Status status;
            std::uint64_t sequence = 0;
            linuxcnc::v1::HalTopology topology;
            try {
              auto snapshot = service->topology_snapshot();
              sequence = snapshot.first;
              topology = std::move(snapshot.second);
            } catch (const HalAdapterError& error) { status = hal_error(error); }
            if (auto gate = weak.lock()) gate->invoke(
                [&](TopologyReactor& reactor) {
                  reactor.scheduled_ = false;
                  if (!status.ok()) { reactor.finish(status); return; }
                  if (sequence <= reactor.after_) return;
                  reactor.message_.Clear();
                  reactor.message_.set_sequence(sequence);
                  *reactor.message_.mutable_topology() = std::move(topology);
                  reactor.writing_sequence_ = sequence;
                  reactor.writing_ = true;
                  reactor.StartWrite(&reactor.message_);
                });
          })) {
        scheduled_ = false;
        finish(service_.worker_.accepting()
                   ? ::grpc::Status(::grpc::StatusCode::RESOURCE_EXHAUSTED,
                                  "HAL runtime queue is full")
                   : ::grpc::Status(::grpc::StatusCode::UNAVAILABLE,
                                  "server shutting down"));
      }
    }
    void finish(::grpc::Status status) {
      gate_->finish([&](TopologyReactor& reactor) {
        reactor.subscription_.reset(); reactor.Finish(status);
      });
    }
    HalServiceImpl& service_;
    std::uint64_t after_ = 0, writing_sequence_ = 0;
    bool admitted_ = false, writing_ = false, scheduled_ = false;
    WatchHalTopologyEvent message_;
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
          state_(std::make_shared<ComponentState>()),
          gate_(std::make_shared<LifetimeGate<ComponentReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<ComponentReactor>> weak = gate_;
      registration_ = service_.callback_registry().register_callback([weak] {
        if (auto gate = weak.lock()) gate->invoke([](ComponentReactor& reactor) {
          reactor.shutdown();
        });
      });
      if (!registration_) { shutdown(); return; }
      if (!admitted_ || !stream_admitted_) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "component or stream admission limit reached"});
        return;
      }
      service_.register_component(state_, gate_);
      StartRead(&request_);
    }
    void OnReadDone(bool ok) override {
      gate_->invoke([ok](ComponentReactor& reactor) { reactor.read_done(ok); });
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](ComponentReactor& reactor) {
        reactor.writing_ = false;
        if (!ok) { reactor.finish(::grpc::Status::OK); return; }
        if (reactor.pending_delta_) {
          reactor.response_ = std::move(*reactor.pending_delta_);
          reactor.pending_delta_.reset();
          reactor.writing_ = true;
          reactor.StartWrite(&reactor.response_);
        } else if (reactor.read_paused_) {
          reactor.read_paused_ = false;
          reactor.StartRead(&reactor.request_);
        }
      });
    }
    void OnCancel() override {
      gate_->invoke([](ComponentReactor& reactor) {
        reactor.finish({::grpc::StatusCode::CANCELLED, "component session cancelled"});
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
    void offer_delta(ComponentSessionMessage message) {
      if (writing_) { pending_delta_ = std::move(message); return; }
      response_ = std::move(message); writing_ = true; StartWrite(&response_);
    }
   private:
    void read_done(bool ok) {
      if (!ok) { finish(::grpc::Status::OK); return; }
      auto request = request_; request_.Clear(); read_paused_ = true;
      const auto state = state_;
      const std::weak_ptr<LifetimeGate<ComponentReactor>> weak = gate_;
      if (!service_.worker_.submit([service = &service_, state, weak,
                                    request = std::move(request)]() mutable {
            ::grpc::Status status;
            std::optional<ComponentSessionMessage> response;
            bool close = false;
            try {
              service->consume_component(*state, request, &response, &close);
            } catch (const HalAdapterError& error) { status = hal_error(error); }
            if (auto gate = weak.lock()) gate->invoke([&](ComponentReactor& reactor) {
              if (!status.ok()) { reactor.finish(status); return; }
              if (close) { reactor.finish(::grpc::Status::OK); return; }
              if (response) {
                reactor.read_paused_ = true;
                reactor.offer_delta(std::move(*response));
              } else {
                reactor.read_paused_ = false;
                reactor.StartRead(&reactor.request_);
              }
            });
          })) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED, "HAL runtime queue is full"});
      }
    }
    void request_cleanup() {
      if (!admitted_ || state_->cleanup_started.exchange(true)) return;
      const auto state = state_;
      auto* admission = &service_.component_admission_;
      if (!service_.worker_.submit_cleanup([state, admission] {
            state->component.reset(); admission->release();
          })) {
        // The reserve is sized for every admitted component. Failure here is
        // a shutdown invariant violation, so perform the idempotent cleanup
        // synchronously instead of leaking the native HAL component.
        state->component.reset(); admission->release();
      }
    }
    void finish(::grpc::Status status) {
      gate_->finish([&](ComponentReactor& reactor) {
        reactor.request_cleanup(); reactor.Finish(status);
      });
    }
    HalServiceImpl& service_;
    bool admitted_ = false, stream_admitted_ = false;
    bool writing_ = false, read_paused_ = false;
    ComponentSessionMessage request_, response_;
    std::optional<ComponentSessionMessage> pending_delta_;
    std::shared_ptr<ComponentState> state_;
    std::shared_ptr<LifetimeGate<ComponentReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };

  void register_component(
      const std::shared_ptr<ComponentState>& state,
      const std::shared_ptr<LifetimeGate<ComponentReactor>>& gate) {
    std::lock_guard lock(components_mutex_);
    components_.push_back({state, gate});
  }

  void consume_component(ComponentState& state,
                         const ComponentSessionMessage& request,
                         std::optional<ComponentSessionMessage>* response,
                         bool* close) {
    switch (request.message_case()) {
      case ComponentSessionMessage::kOpen: {
        if (state.component) throw HalAdapterError("component is already open", -EBUSY);
        state.component = adapter_.open_component(request.open().name(), request.open().prefix());
        ComponentSessionMessage message;
        message.mutable_metadata()->set_writer_id(state.component->name());
        message.mutable_metadata()->set_ready(false);
        *response = std::move(message);
        return;
      }
      case ComponentSessionMessage::kPin: {
        if (!state.component) throw HalAdapterError("open a component before creating pins", -EINVAL);
        const auto type = decode_hal_type(request.pin().type());
        if (!type) throw HalAdapterError("invalid component pin type", -EINVAL);
        HalAdapterPinDirection direction;
        switch (request.pin().direction()) {
          case HAL_PIN_DIRECTION_IN: direction = HalAdapterPinDirection::In; break;
          case HAL_PIN_DIRECTION_OUT: direction = HalAdapterPinDirection::Out; break;
          case HAL_PIN_DIRECTION_IO: direction = HalAdapterPinDirection::Io; break;
          default: throw HalAdapterError("invalid component pin direction", -EINVAL);
        }
        if (!state.component->add_pin(request.pin().name(), *type, direction))
          throw HalAdapterError("component pin was rejected", -EINVAL);
        state.items.push_back({request.pin().name(), HAL_ITEM_KIND_PIN,
            state.component->prefix() + "." + request.pin().name(), std::nullopt});
        return;
      }
      case ComponentSessionMessage::kParameter: {
        if (!state.component) throw HalAdapterError("open a component before creating parameters", -EINVAL);
        const auto type = decode_hal_type(request.parameter().type());
        if (!type) throw HalAdapterError("invalid component parameter type", -EINVAL);
        HalAdapterParamDirection direction;
        switch (request.parameter().direction()) {
          case HAL_PARAM_DIRECTION_RO: direction = HalAdapterParamDirection::ReadOnly; break;
          case HAL_PARAM_DIRECTION_RW: direction = HalAdapterParamDirection::ReadWrite; break;
          default: throw HalAdapterError("invalid component parameter direction", -EINVAL);
        }
        if (!state.component->add_param(request.parameter().name(), *type, direction))
          throw HalAdapterError("component parameter was rejected", -EINVAL);
        state.items.push_back({request.parameter().name(), HAL_ITEM_KIND_PARAM,
            state.component->prefix() + "." + request.parameter().name(), std::nullopt});
        return;
      }
      case ComponentSessionMessage::kReady: {
        if (!state.component) throw HalAdapterError("component is not open", -EINVAL);
        if (request.ready().ready()) state.component->set_ready();
        else state.component->set_unready();
        state.ready = request.ready().ready();
        ComponentSessionMessage message;
        message.mutable_metadata()->set_writer_id(state.component->name());
        message.mutable_metadata()->set_ready(state.component->ready());
        *response = std::move(message);
        return;
      }
      case ComponentSessionMessage::kValue: {
        if (!state.component) throw HalAdapterError("component is not open", -EINVAL);
        auto value = decode_hal_scalar(request.value().value());
        if (!value) throw HalAdapterError("component value oneof is invalid", -EINVAL);
        auto name = request.value().item().name();
        const auto prefix = state.component->prefix() + ".";
        if (name.rfind(prefix, 0) == 0) name.erase(0, prefix.size());
        if (!state.component->write(name, *value))
          throw HalAdapterError("component value was rejected", -EINVAL);
        return;
      }
      case ComponentSessionMessage::kClose: *close = true; return;
      default: throw HalAdapterError("client sent an invalid component session message", -EINVAL);
    }
  }

  void sample_components() {
    std::vector<ComponentRegistration> registrations;
    {
      std::lock_guard lock(components_mutex_);
      components_.erase(std::remove_if(components_.begin(), components_.end(),
          [](const ComponentRegistration& item) {
            return item.state.expired() || item.gate.expired();
          }), components_.end());
      registrations = components_;
    }
    for (const auto& registration : registrations) {
      auto state = registration.state.lock();
      if (!state || !state->component || !state->ready || state->cleanup_started.load()) continue;
      ComponentSessionMessage message;
      auto* delta = message.mutable_delta();
      for (auto& item : state->items) {
        const auto value = state->component->read(item.suffix);
        if (!value || (item.previous && *item.previous == *value)) continue;
        item.previous = value;
        auto* encoded = delta->add_values();
        encoded->mutable_item()->set_kind(item.kind);
        encoded->mutable_item()->set_name(item.full_name);
        encode_hal_scalar(*value, encoded->mutable_value());
      }
      if (delta->values_size() == 0) continue;
      delta->set_sequence(++state->sequence);
      if (auto gate = registration.gate.lock())
        gate->invoke([message = std::move(message)](ComponentReactor& reactor) mutable {
          reactor.offer_delta(std::move(message));
        });
    }
  }

  void timer_loop() {
    auto next_topology = std::chrono::steady_clock::now();
    while (!stopping_.load()) {
      const auto now = std::chrono::steady_clock::now();
      const bool refresh_topology = now >= next_topology;
      if (refresh_topology) next_topology = now + topology_period_;
      worker_.submit([this, refresh_topology] {
        sample_components();
        if (!refresh_topology) return;
        try {
          const auto snapshot = topology_snapshot();
          if (snapshot.first > last_published_topology_) {
            last_published_topology_ = snapshot.first;
            topology_wakes_.publish(snapshot.first);
          }
        } catch (const HalAdapterError&) {}
      });
      std::unique_lock lock(timer_mutex_);
      timer_condition_.wait_for(lock, std::chrono::milliseconds(50),
                                [this] { return stopping_.load(); });
    }
  }

  std::pair<std::uint64_t, linuxcnc::v1::HalTopology> topology_snapshot() {
    linuxcnc::v1::HalTopology current;
    encode_hal_topology(adapter_.topology(), &current);
    auto structural = current;
    for (auto& pin : *structural.mutable_pins()) pin.clear_value();
    for (auto& parameter : *structural.mutable_params()) parameter.clear_value();
    for (auto& signal : *structural.mutable_signals()) signal.clear_value();
    const auto serialized = structural.SerializeAsString();
    std::lock_guard lock(topology_mutex_);
    if (topology_sequence_ == 0 || serialized != topology_serialized_) {
      ++topology_sequence_;
      topology_serialized_ = serialized;
    }
    return {topology_sequence_, std::move(current)};
  }

  LinuxCncHalAdapter adapter_;
  struct ComponentRegistration {
    std::weak_ptr<ComponentState> state;
    std::weak_ptr<LifetimeGate<ComponentReactor>> gate;
  };
  BoundedExecutor& worker_;
  AdmissionCounter& component_admission_;
  AdmissionCounter& stream_admission_;
  const std::chrono::milliseconds topology_period_;
  SubscriptionHub<std::uint64_t> topology_wakes_;
  std::mutex components_mutex_;
  std::vector<ComponentRegistration> components_;
  std::mutex topology_mutex_;
  std::string topology_serialized_;
  std::uint64_t topology_sequence_ = 0;
  std::uint64_t last_published_topology_ = 0;
  std::atomic<bool> writer_ready_{true};
  std::atomic<bool> stopping_{false};
  std::mutex timer_mutex_;
  std::condition_variable timer_condition_;
  std::thread timer_;
};

#else

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
      ::grpc::CallbackServerContext*, const WatchHalTopologyRequest* request) override {
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
    HalItem item{request->name(), static_cast<HalScalarType>(type - HAL_TYPE_BIT), false, true,
                 default_hal_value(type)};
    if (!repository_.add_item(item)) return Invalid("signal already exists or has invalid type");
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
      if (!registration_) { shutdown(); return; }
      if (!admitted_) { finish({::grpc::StatusCode::RESOURCE_EXHAUSTED, "stream admission limit reached"}); return; }
      subscription_ = service_.topology_wakes_.subscribe([weak](const std::uint64_t&) {
        auto gate = weak.lock(); if (gate) gate->invoke([](TopologyReactor& r) { r.schedule(); });
      });
      schedule();
    }
    void OnWriteDone(bool ok) override { gate_->invoke([ok](TopologyReactor& r) { r.writing_ = false; if (!ok) r.finish(::grpc::Status::OK); else r.schedule(); }); }
    void OnCancel() override { gate_->invoke([](TopologyReactor& r) { r.finish({::grpc::StatusCode::CANCELLED, "topology stream cancelled"}); }); }
    void OnDone() override { subscription_.reset(); gate_->detach(); registration_.reset(); if (admitted_) service_.stream_admission_.release(); delete this; }
    void shutdown() { subscription_.reset(); finish({::grpc::StatusCode::UNAVAILABLE, "server shutting down"}); }
   private:
    void schedule() {
      if (writing_ || gate_->state() != LifetimeGate<TopologyReactor>::State::Open ||
          scheduled_.exchange(true)) return;
      const std::weak_ptr<LifetimeGate<TopologyReactor>> weak = gate_;
      if (!service_.worker_.submit([weak] { auto gate = weak.lock(); if (gate) gate->invoke([](TopologyReactor& r) { r.scheduled_ = false; r.emit(); }); })) {
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
      if (topology.generation <= sequence_) return;
      message_.Clear(); message_.set_sequence(topology.generation);
      for (const auto& item : topology.items) {
        auto* pin = item.pin ? message_.mutable_topology()->add_pins() : nullptr;
        auto* param = item.pin ? nullptr : message_.mutable_topology()->add_params();
        auto* scalar = item.pin ? pin->mutable_value() : param->mutable_value();
        encode_hal_value(item.value, scalar);
        if (item.pin) { pin->set_name(item.name); pin->set_type(static_cast<HalType>(scalar->type())); }
        else { param->set_name(item.name); param->set_type(static_cast<HalType>(scalar->type())); }
      }
      sequence_ = topology.generation; writing_ = true; StartWrite(&message_);
    }
    void finish(::grpc::Status status) {
      gate_->finish([&](TopologyReactor& reactor) {
        reactor.subscription_.reset();
        reactor.Finish(status);
      });
    }
    HalServiceImpl& service_; bool admitted_ = false; bool writing_ = false;
    std::uint64_t sequence_ = 0; WatchHalTopologyEvent message_;
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
      if (!registration_) { shutdown(); return; }
      if (!admitted_ || !stream_admitted_) finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                              "component or stream admission limit reached"});
      else StartRead(&request_);
    }
    void OnReadDone(bool ok) override { gate_->invoke([ok](ComponentReactor& r) { r.read_done(ok); }); }
    void OnWriteDone(bool ok) override { gate_->invoke([ok](ComponentReactor& r) { r.write_done(ok); }); }
    void OnCancel() override { gate_->invoke([](ComponentReactor& r) { r.finish({::grpc::StatusCode::CANCELLED, "component cancelled"}); }); }
    void OnDone() override {
      gate_->detach(); cleanup();
      registration_.reset();
      if (stream_admitted_) service_.stream_admission_.release();
      delete this;
    }
    void shutdown() { cleanup(); finish({::grpc::StatusCode::UNAVAILABLE, "server shutting down"}); }
   private:
    void read_done(bool ok) {
      if (!ok) { finish(::grpc::Status::OK); return; }
      auto request = request_; request_.Clear();
      const std::weak_ptr<LifetimeGate<ComponentReactor>> weak_gate = gate_;
      if (!service_.worker_.submit([weak_gate, request = std::move(request)]() mutable {
            auto gate = weak_gate.lock();
            if (gate) gate->invoke([&](ComponentReactor& r) { r.consume(request); });
          })) finish({::grpc::StatusCode::RESOURCE_EXHAUSTED, "HAL work queue is full"});
    }
    void consume(const ComponentSessionMessage& request) {
      ::grpc::Status error;
      bool respond = false;
      switch (request.message_case()) {
        case ComponentSessionMessage::kOpen:
          prefix_ = request.open().prefix().empty() ? request.open().name() : request.open().prefix();
          writer_id_ = request.open().name();
          response_.Clear(); response_.mutable_metadata()->set_writer_id(request.open().name());
          response_.mutable_metadata()->set_ready(false); respond = true; break;
        case ComponentSessionMessage::kPin: {
          const auto& pin = request.pin(); const auto name = prefix_ + "." + pin.name();
          const auto type = static_cast<HalType>(pin.type());
          if (!service_.repository_.add_item(HalItem{name, static_cast<HalScalarType>(type - HAL_TYPE_BIT), true, pin.direction() != HAL_PIN_DIRECTION_IN, default_hal_value(type)})) error = Invalid("pin rejected");
          else owned_.push_back(name);
          service_.topology_wakes_.publish(service_.repository_.generation());
          break;
        }
        case ComponentSessionMessage::kParameter: {
          const auto& value = request.parameter(); const auto name = prefix_ + "." + value.name();
          const auto type = static_cast<HalType>(value.type());
          if (!service_.repository_.add_item(HalItem{name, static_cast<HalScalarType>(type - HAL_TYPE_BIT), false, value.direction() == HAL_PARAM_DIRECTION_RW, default_hal_value(type)})) error = Invalid("parameter rejected");
          else owned_.push_back(name);
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
          if (!value || !service_.repository_.write(request.value().item().name(), *value)) error = Invalid("component value rejected");
          else {
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
        case ComponentSessionMessage::kClose: finish(::grpc::Status::OK); return;
        default: error = Invalid("component message required"); break;
      }
      if (!error.ok()) { finish(error); return; }
      if (respond) { writing_ = true; StartWrite(&response_); }
      else StartRead(&request_);
    }
    void write_done(bool ok) { writing_ = false; if (!ok) finish(::grpc::Status::OK); else StartRead(&request_); }
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
    HalServiceImpl& service_; bool admitted_ = false; bool stream_admitted_ = false;
    bool writing_ = false;
    std::string prefix_, writer_id_; std::vector<std::string> owned_;
    std::uint64_t sequence_ = 0;
    ComponentSessionMessage request_; ComponentSessionMessage response_;
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

#endif

}  // namespace

std::unique_ptr<ManagedGrpcService> make_hal_service(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& component_admission,
    AdmissionCounter& stream_admission) {
  return std::make_unique<HalServiceImpl>(
      config, worker, component_admission, stream_admission);
}

}  // namespace linuxcnc::server::detail
