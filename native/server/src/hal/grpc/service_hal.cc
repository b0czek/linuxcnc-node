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
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#include "hal/grpc/component_outbox.hpp"
#include "hal/grpc/service_internal.hpp"
#include "linuxcnc_grpc/daemon/config.hpp"
#include "linuxcnc_grpc/hal/grpc/mapping.hpp"
#include "linuxcnc_grpc/hal/adapter.hpp"
#include "linuxcnc_grpc/hal/value_telemetry.hpp"

namespace linuxcnc::server::detail {
namespace {

::grpc::Status hal_error(const HalAdapterError& error) {
  const auto code =
      error.code() == -ENOENT   ? ::grpc::StatusCode::NOT_FOUND
      : error.code() == -EBUSY  ? ::grpc::StatusCode::RESOURCE_EXHAUSTED
      : error.code() == -EINVAL ? ::grpc::StatusCode::INVALID_ARGUMENT
                                : ::grpc::StatusCode::FAILED_PRECONDITION;
  return {code, error.what()};
}

std::optional<HalAdapterType> decode_hal_type(HalType type) {
  if (type < HAL_TYPE_BIT || type > HAL_TYPE_U64) return std::nullopt;
  return static_cast<HalAdapterType>(static_cast<int>(type) - 1);
}

HalTelemetryReference telemetry_reference(const HalAdapterReference& source) {
  return {static_cast<HalTelemetryItemKind>(static_cast<int>(source.kind) + 1),
          source.name};
}

HalAdapterReference adapter_reference(const HalTelemetryReference& source) {
  return {static_cast<HalAdapterItemKind>(static_cast<int>(source.kind) - 1),
          source.name};
}

void encode_subscription(const HalTelemetryDescriptor& source,
                         HalValueSubscription* target) {
  target->Clear();
  target->set_subscription_id(source.subscription_id);
  target->set_websocket_path(source.websocket_path);
  target->set_revision(source.revision);
  target->set_sample_period_ms(
      static_cast<std::uint32_t>(source.sample_period.count()));
  for (const auto& binding : source.bindings) {
    auto* slot = target->add_slots();
    slot->set_slot(binding.slot);
    slot->mutable_item()->set_kind(
        static_cast<HalItemKind>(static_cast<int>(binding.item.kind)));
    slot->mutable_item()->set_name(binding.item.name);
    slot->set_type(static_cast<HalType>(static_cast<int>(binding.type)));
  }
}

class HalServiceImpl final : public HalUnaryService, public ManagedGrpcService {
  class TopologyReactor;
  class ComponentReactor;

 public:
  ::grpc::Service* service() noexcept override { return this; }

  HalServiceImpl(const DaemonConfig& config, BoundedExecutor& worker,
                 AdmissionCounter& component_admission,
                 AdmissionCounter& stream_admission,
                 std::shared_ptr<HalValueTelemetry> telemetry)
      : HalUnaryService(worker),
        worker_(worker),
        component_admission_(component_admission),
        stream_admission_(stream_admission),
        telemetry_(std::move(telemetry)),
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
      ::grpc::CallbackServerContext*,
      const WatchHalTopologyRequest* request) override {
    return new TopologyReactor(*this, request->after_sequence());
  }

  ::grpc::Status do_read(const HalReadRequest* request,
                         HalReadResponse* response) override {
    try {
      std::vector<HalAdapterReference> references;
      references.reserve(request->items_size());
      for (const auto& item : request->items()) {
        auto decoded = decode_hal_reference(item);
        if (!decoded)
          return Invalid("HAL read contains an invalid item reference");
        references.push_back(std::move(*decoded));
      }
      const auto values = adapter_.read_many(references);
      for (std::size_t index = 0; index < values.size(); ++index) {
        const auto& value = values[index];
        if (!value) {
          return {::grpc::StatusCode::NOT_FOUND,
                  "HAL item '" + references[index].name + "' was not found"};
        }
        auto* encoded = response->add_values();
        *encoded->mutable_item() = request->items(static_cast<int>(index));
        encode_hal_scalar(value.value(), encoded->mutable_value());
      }
      return ::grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  ::grpc::Status do_write(const HalWrite* request,
                          HalWriteResponse* response) override {
    try {
      std::vector<std::pair<HalAdapterReference, HalAdapterValue>> updates;
      updates.reserve(request->writes_size());
      for (const auto& write : request->writes()) {
        auto reference = decode_hal_reference(write.item());
        auto value = decode_hal_scalar(write.value());
        if (!reference || !value) {
          return Invalid(
              "HAL write contains a mismatched reference or scalar oneof");
        }
        updates.emplace_back(std::move(reference.value()), value.value());
      }
      std::vector<HalAdapterValue> written;
      if (adapter_.write_many(updates, &written) != updates.size()) {
        return {::grpc::StatusCode::FAILED_PRECONDITION,
                "one or more HAL items are missing, mistyped, or not writable"};
      }
      for (std::size_t index = 0; index < updates.size(); ++index) {
        auto* encoded = response->add_values();
        *encoded->mutable_item() =
            request->writes(static_cast<int>(index)).item();
        encode_hal_scalar(written[index], encoded->mutable_value());
      }
      return ::grpc::Status::OK;
    } catch (const HalAdapterError& error) {
      return hal_error(error);
    }
  }

  ::grpc::Status do_create_value_subscription(
      const CreateHalValueSubscriptionRequest* request,
      HalValueSubscription* response) override {
    if (request->items_size() == 0)
      return Invalid("HAL value subscription requires at least one item");
    auto resolved = resolve_subscription_items(request->items(), nullptr);
    if (!resolved.first.ok()) return resolved.first;
    const auto period = subscription_period(request->sample_period_ms());
    if (!period)
      return Invalid("HAL value sample period must be between 50 and 60000 ms");
    auto created = telemetry_->create(std::move(resolved.second), *period);
    if (!created)
      return {::grpc::StatusCode::RESOURCE_EXHAUSTED,
              "HAL value subscription limit reached"};
    encode_subscription(*created, response);
    return ::grpc::Status::OK;
  }

  ::grpc::Status do_update_value_subscription(
      const UpdateHalValueSubscriptionRequest* request,
      HalValueSubscription* response) override {
    const auto current = telemetry_->descriptor(request->subscription_id());
    if (!current)
      return {::grpc::StatusCode::NOT_FOUND,
              "HAL value subscription was not found"};
    if (current->revision != request->expected_revision())
      return {::grpc::StatusCode::ABORTED,
              "HAL value subscription revision does not match"};
    auto resolved = resolve_subscription_items(request->items(), &*current);
    if (!resolved.first.ok()) return resolved.first;
    const auto period = subscription_period(request->sample_period_ms());
    if (!period)
      return Invalid("HAL value sample period must be between 50 and 60000 ms");
    auto updated = telemetry_->update(request->subscription_id(),
                                      request->expected_revision(),
                                      std::move(resolved.second), *period);
    if (!updated)
      return {::grpc::StatusCode::ABORTED,
              "HAL value subscription changed concurrently"};
    encode_subscription(*updated, response);
    return ::grpc::Status::OK;
  }

  ::grpc::Status do_delete_value_subscription(
      const DeleteHalValueSubscriptionRequest* request,
      google::protobuf::Empty*) override {
    if (request->subscription_id().empty())
      return Invalid("HAL value subscription id is required");
    telemetry_->erase(request->subscription_id());
    return ::grpc::Status::OK;
  }

  ::grpc::Status do_create_signal(const CreateHalSignalRequest* request,
                                  CreateHalSignalResponse* response) override {
    const auto type = decode_hal_type(request->type());
    if (request->name().empty() || !type) {
      return Invalid("signal name and type are required");
    }
    try {
      if (!adapter_.create_signal(request->name(), *type)) {
        return Invalid("HAL signal was rejected");
      }
      const auto topology = adapter_.topology();
      const auto found = std::find_if(
          topology.signals.begin(), topology.signals.end(),
          [&](const auto& signal) { return signal.name == request->name(); });
      if (found == topology.signals.end()) {
        return {::grpc::StatusCode::INTERNAL,
                "created HAL signal is not visible"};
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

  ::grpc::Status do_set_message_level(const SetHalMessageLevelRequest* request,
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

  ::grpc::Status do_get_writer_metadata(
      const GetHalWriterMetadataRequest*,
      GetHalWriterMetadataResponse* response) override {
    response->mutable_metadata()->set_writer_id("linuxcnc-grpc-server");
    response->mutable_metadata()->set_ready(
        writer_ready_.load(std::memory_order_relaxed));
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
  static std::optional<std::chrono::milliseconds> subscription_period(
      std::uint32_t value) {
    if (value == 0) value = 100;
    if (value < 50 || value > 60000) return std::nullopt;
    return std::chrono::milliseconds(value);
  }

  std::pair<::grpc::Status, std::vector<HalTelemetryResolvedItem>>
  resolve_subscription_items(
      const google::protobuf::RepeatedPtrField<HalItemRef>& items,
      const HalTelemetryDescriptor* existing) {
    if (items.size() > 1024)
      return {{::grpc::StatusCode::RESOURCE_EXHAUSTED,
               "HAL value subscription exceeds 1024 items"},
              {}};
    std::vector<HalAdapterReference> references;
    std::unordered_set<std::string> unique;
    for (const auto& item : items) {
      auto decoded = decode_hal_reference(item);
      if (!decoded)
        return {Invalid("HAL value subscription contains an invalid item"), {}};
      const auto key =
          std::to_string(static_cast<int>(decoded->kind)) + ":" + decoded->name;
      if (!unique.insert(key).second)
        return {Invalid("HAL value subscription contains a duplicate item"),
                {}};
      references.push_back(std::move(*decoded));
    }
    const auto values = adapter_.read_many(references);
    std::unordered_map<std::string, HalTelemetryType> prior;
    if (existing)
      for (const auto& binding : existing->bindings)
        prior.emplace(std::to_string(static_cast<int>(binding.item.kind)) +
                          ":" + binding.item.name,
                      binding.type);
    std::vector<HalTelemetryResolvedItem> result;
    for (std::size_t index = 0; index < references.size(); ++index) {
      const auto reference = telemetry_reference(references[index]);
      HalTelemetryType type = HalTelemetryType::Unavailable;
      const auto& value = values[index];
      if (value) {
        type = static_cast<HalTelemetryType>(value->index() + 1);
      } else {
        const auto found =
            prior.find(std::to_string(static_cast<int>(reference.kind)) + ":" +
                       reference.name);
        if (found == prior.end())
          return {{::grpc::StatusCode::NOT_FOUND,
                   "HAL item '" + reference.name + "' was not found"},
                  {}};
        type = found->second;
      }
      result.push_back({reference, type});
    }
    return {::grpc::Status::OK, std::move(result)};
  }

  void sample_telemetry() {
    for (const auto& due : telemetry_->due(std::chrono::steady_clock::now())) {
      std::vector<HalAdapterReference> references;
      references.reserve(due.bindings.size());
      for (const auto& binding : due.bindings)
        references.push_back(adapter_reference(binding.item));
      auto values = adapter_.read_many(references);
      std::vector<std::optional<HalTelemetryValue>> published;
      published.reserve(values.size());
      for (std::size_t index = 0; index < values.size(); ++index) {
        if (!values[index] ||
            values[index]->index() + 1 !=
                static_cast<std::size_t>(due.bindings[index].type))
          published.emplace_back();
        else
          published.push_back(values[index]);
      }
      telemetry_->publish(due.subscription_id, due.revision,
                          std::move(published));
    }
  }

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
        : service_(service),
          after_(after),
          admitted_(service_.stream_admission_.acquire()),
          gate_(std::make_shared<LifetimeGate<TopologyReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<TopologyReactor>> weak = gate_;
      registration_ = service_.callback_registry().register_callback([weak] {
        if (auto gate = weak.lock())
          gate->invoke([](TopologyReactor& reactor) { reactor.shutdown(); });
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
          service_.topology_wakes_.subscribe([weak](const std::uint64_t&) {
            if (auto gate = weak.lock())
              gate->invoke(
                  [](TopologyReactor& reactor) { reactor.schedule(); });
          });
      schedule();
    }
    void OnWriteDone(bool ok) override {
      gate_->invoke([ok](TopologyReactor& reactor) {
        reactor.writing_ = false;
        if (!ok)
          reactor.finish(::grpc::Status::OK);
        else {
          reactor.after_ = reactor.writing_sequence_;
          reactor.schedule();
        }
      });
    }
    void OnCancel() override {
      gate_->invoke([](TopologyReactor& reactor) {
        reactor.finish(
            {::grpc::StatusCode::CANCELLED, "topology stream cancelled"});
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
          gate_->state() != LifetimeGate<TopologyReactor>::State::Open)
        return;
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
            } catch (const HalAdapterError& error) {
              status = hal_error(error);
            }
            if (auto gate = weak.lock())
              gate->invoke([&](TopologyReactor& reactor) {
                reactor.scheduled_ = false;
                if (!status.ok()) {
                  reactor.finish(status);
                  return;
                }
                if (sequence == reactor.after_) return;
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
        reactor.subscription_.reset();
        reactor.Finish(status);
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
        : service_(service),
          admitted_(service_.component_admission_.acquire()),
          stream_admitted_(service_.stream_admission_.acquire()),
          state_(std::make_shared<ComponentState>()),
          gate_(std::make_shared<LifetimeGate<ComponentReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<ComponentReactor>> weak = gate_;
      registration_ = service_.callback_registry().register_callback([weak] {
        if (auto gate = weak.lock())
          gate->invoke([](ComponentReactor& reactor) { reactor.shutdown(); });
      });
      if (!registration_) {
        shutdown();
        return;
      }
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
        if (!ok) {
          reactor.finish(::grpc::Status::OK);
          return;
        }
        if (reactor.active_response_) reactor.resume_read_when_idle_ = true;
        if (!reactor.outbox_.empty()) {
          reactor.start_write(reactor.outbox_.pop_front());
        } else if (reactor.resume_read_when_idle_) {
          reactor.resume_read_when_idle_ = false;
          reactor.StartRead(&reactor.request_);
        }
      });
    }
    void OnCancel() override {
      gate_->invoke([](ComponentReactor& reactor) {
        reactor.finish(
            {::grpc::StatusCode::CANCELLED, "component session cancelled"});
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
      if (writing_) {
        outbox_.push_delta(std::move(message));
        return;
      }
      start_write({std::move(message), false});
    }

   private:
    void offer_response(ComponentSessionMessage message) {
      if (writing_) {
        outbox_.push_response(std::move(message));
        return;
      }
      start_write({std::move(message), true});
    }
    void start_write(ComponentOutbox::Entry entry) {
      response_ = std::move(entry.message);
      active_response_ = entry.resume_read;
      writing_ = true;
      StartWrite(&response_);
    }
    void read_done(bool ok) {
      if (!ok) {
        finish(::grpc::Status::OK);
        return;
      }
      auto request = request_;
      request_.Clear();
      const auto state = state_;
      const std::weak_ptr<LifetimeGate<ComponentReactor>> weak = gate_;
      if (!service_.worker_.submit([service = &service_, state, weak,
                                    request = std::move(request)]() mutable {
            ::grpc::Status status;
            std::optional<ComponentSessionMessage> response;
            bool close = false;
            try {
              service->consume_component(*state, request, &response, &close);
            } catch (const HalAdapterError& error) {
              status = hal_error(error);
            }
            if (auto gate = weak.lock())
              gate->invoke([&](ComponentReactor& reactor) {
                if (!status.ok()) {
                  reactor.finish(status);
                  return;
                }
                if (close) {
                  reactor.finish(::grpc::Status::OK);
                  return;
                }
                if (response) {
                  reactor.offer_response(std::move(*response));
                } else {
                  reactor.StartRead(&reactor.request_);
                }
              });
          })) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "HAL runtime queue is full"});
      }
    }
    void request_cleanup() {
      if (!admitted_ || state_->cleanup_started.exchange(true)) return;
      const auto state = state_;
      auto* admission = &service_.component_admission_;
      if (!service_.worker_.submit_cleanup([state, admission] {
            state->component.reset();
            admission->release();
          })) {
        // The reserve is sized for every admitted component. Failure here is
        // a shutdown invariant violation, so perform the idempotent cleanup
        // synchronously instead of leaking the native HAL component.
        state->component.reset();
        admission->release();
      }
    }
    void finish(::grpc::Status status) {
      gate_->finish([&](ComponentReactor& reactor) {
        reactor.request_cleanup();
        reactor.Finish(status);
      });
    }
    HalServiceImpl& service_;
    bool admitted_ = false, stream_admitted_ = false;
    bool writing_ = false, active_response_ = false;
    bool resume_read_when_idle_ = false;
    ComponentSessionMessage request_, response_;
    ComponentOutbox outbox_;
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
        if (state.component) {
          throw HalAdapterError("component is already open", -EBUSY);
        }
        state.component = adapter_.open_component(request.open().name(),
                                                  request.open().prefix());
        ComponentSessionMessage message;
        message.mutable_metadata()->set_writer_id(state.component->name());
        message.mutable_metadata()->set_ready(false);
        *response = std::move(message);
        return;
      }
      case ComponentSessionMessage::kPin: {
        if (!state.component) {
          throw HalAdapterError("open a component before creating pins",
                                -EINVAL);
        }
        const auto type = decode_hal_type(request.pin().type());
        if (!type) throw HalAdapterError("invalid component pin type", -EINVAL);
        HalAdapterPinDirection direction;
        switch (request.pin().direction()) {
          case HAL_PIN_DIRECTION_IN:
            direction = HalAdapterPinDirection::In;
            break;
          case HAL_PIN_DIRECTION_OUT:
            direction = HalAdapterPinDirection::Out;
            break;
          case HAL_PIN_DIRECTION_IO:
            direction = HalAdapterPinDirection::Io;
            break;
          default:
            throw HalAdapterError("invalid component pin direction", -EINVAL);
        }
        if (!state.component->add_pin(request.pin().name(), *type, direction))
          throw HalAdapterError("component pin was rejected", -EINVAL);
        state.items.push_back(
            {request.pin().name(), HAL_ITEM_KIND_PIN,
             state.component->prefix() + "." + request.pin().name(),
             std::nullopt});
        return;
      }
      case ComponentSessionMessage::kParameter: {
        if (!state.component) {
          throw HalAdapterError("open a component before creating parameters",
                                -EINVAL);
        }
        const auto type = decode_hal_type(request.parameter().type());
        if (!type)
          throw HalAdapterError("invalid component parameter type", -EINVAL);
        HalAdapterParamDirection direction;
        switch (request.parameter().direction()) {
          case HAL_PARAM_DIRECTION_RO:
            direction = HalAdapterParamDirection::ReadOnly;
            break;
          case HAL_PARAM_DIRECTION_RW:
            direction = HalAdapterParamDirection::ReadWrite;
            break;
          default:
            throw HalAdapterError("invalid component parameter direction",
                                  -EINVAL);
        }
        if (!state.component->add_param(request.parameter().name(), *type,
                                        direction))
          throw HalAdapterError("component parameter was rejected", -EINVAL);
        state.items.push_back(
            {request.parameter().name(), HAL_ITEM_KIND_PARAM,
             state.component->prefix() + "." + request.parameter().name(),
             std::nullopt});
        return;
      }
      case ComponentSessionMessage::kReady: {
        if (!state.component) {
          throw HalAdapterError("component is not open", -EINVAL);
        }
        if (request.ready().ready()) {
          state.component->set_ready();
        } else {
          state.component->set_unready();
        }
        state.ready = request.ready().ready();
        ComponentSessionMessage message;
        message.mutable_metadata()->set_writer_id(state.component->name());
        message.mutable_metadata()->set_ready(state.component->ready());
        *response = std::move(message);
        return;
      }
      case ComponentSessionMessage::kValue: {
        if (!state.component) {
          throw HalAdapterError("component is not open", -EINVAL);
        }
        auto value = decode_hal_scalar(request.value().value());
        if (!value)
          throw HalAdapterError("component value oneof is invalid", -EINVAL);
        auto name = request.value().item().name();
        const auto prefix = state.component->prefix() + ".";
        if (name.rfind(prefix, 0) == 0) name.erase(0, prefix.size());
        if (!state.component->write(name, *value))
          throw HalAdapterError("component value was rejected", -EINVAL);
        ComponentSessionMessage message;
        *message.mutable_value() = request.value();
        *response = std::move(message);
        return;
      }
      case ComponentSessionMessage::kClose:
        *close = true;
        return;
      default:
        throw HalAdapterError(
            "client sent an invalid component session message", -EINVAL);
    }
  }

  void sample_components() {
    std::vector<ComponentRegistration> registrations;
    {
      std::lock_guard lock(components_mutex_);
      components_.erase(std::remove_if(components_.begin(), components_.end(),
                                       [](const ComponentRegistration& item) {
                                         return item.state.expired() ||
                                                item.gate.expired();
                                       }),
                        components_.end());
      registrations = components_;
    }
    for (const auto& registration : registrations) {
      auto state = registration.state.lock();
      if (!state || !state->component || !state->ready ||
          state->cleanup_started.load())
        continue;
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
        gate->invoke(
            [message = std::move(message)](ComponentReactor& reactor) mutable {
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
        sample_telemetry();
        if (!refresh_topology) return;
        try {
          const auto snapshot = topology_snapshot();
          if (snapshot.first > last_published_topology_) {
            last_published_topology_ = snapshot.first;
            topology_wakes_.publish(snapshot.first);
          }
        } catch (const HalAdapterError&) {
          last_published_topology_ = 0;
        }
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
    for (auto& parameter : *structural.mutable_params())
      parameter.clear_value();
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
  std::shared_ptr<HalValueTelemetry> telemetry_;
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

}  // namespace

std::unique_ptr<ManagedGrpcService> make_hal_service_impl(
    const DaemonConfig& config, BoundedExecutor& worker,
    AdmissionCounter& component_admission, AdmissionCounter& stream_admission,
    std::shared_ptr<HalValueTelemetry> telemetry) {
  return std::make_unique<HalServiceImpl>(config, worker, component_admission,
                                          stream_admission,
                                          std::move(telemetry));
}

}  // namespace linuxcnc::server::detail
