#include "linuxcnc_grpc/grpc_hal_mapping.hpp"

#include <cstdint>

namespace linuxcnc::server {
namespace {

linuxcnc::v1::HalType encode_type(HalAdapterType type) {
  return static_cast<linuxcnc::v1::HalType>(static_cast<int>(type) + 1);
}

linuxcnc::v1::HalPinDirection encode_pin_direction(
    HalAdapterPinDirection direction) {
  return static_cast<linuxcnc::v1::HalPinDirection>(
      static_cast<int>(direction) + 1);
}

linuxcnc::v1::HalParamDirection encode_param_direction(
    HalAdapterParamDirection direction) {
  return static_cast<linuxcnc::v1::HalParamDirection>(
      static_cast<int>(direction) + 1);
}

linuxcnc::v1::HalComponentKind encode_component_kind(
    HalAdapterComponentKind kind) {
  switch (kind) {
    case HalAdapterComponentKind::User:
      return linuxcnc::v1::HAL_COMPONENT_KIND_USER;
    case HalAdapterComponentKind::Realtime:
      return linuxcnc::v1::HAL_COMPONENT_KIND_REALTIME;
    case HalAdapterComponentKind::Other:
      return linuxcnc::v1::HAL_COMPONENT_KIND_OTHER;
    case HalAdapterComponentKind::Unknown:
      return linuxcnc::v1::HAL_COMPONENT_KIND_UNKNOWN;
  }
  return linuxcnc::v1::HAL_COMPONENT_KIND_UNKNOWN;
}

}  // namespace

std::optional<HalAdapterReference> decode_hal_reference(
    const linuxcnc::v1::HalItemRef& source) {
  if (source.name().empty()) return std::nullopt;
  HalAdapterItemKind kind;
  switch (source.kind()) {
    case linuxcnc::v1::HAL_ITEM_KIND_PIN:
      kind = HalAdapterItemKind::Pin;
      break;
    case linuxcnc::v1::HAL_ITEM_KIND_PARAM:
      kind = HalAdapterItemKind::Param;
      break;
    case linuxcnc::v1::HAL_ITEM_KIND_SIGNAL:
      kind = HalAdapterItemKind::Signal;
      break;
    default:
      return std::nullopt;
  }
  return HalAdapterReference{kind, source.name()};
}

std::optional<HalAdapterValue> decode_hal_scalar(
    const linuxcnc::v1::HalScalar& source) {
  switch (source.type()) {
    case linuxcnc::v1::HAL_TYPE_BIT:
      if (source.value_case() == linuxcnc::v1::HalScalar::kBit)
        return HalAdapterValue{source.bit()};
      break;
    case linuxcnc::v1::HAL_TYPE_FLOAT:
      if (source.value_case() == linuxcnc::v1::HalScalar::kFloatValue)
        return HalAdapterValue{source.float_value()};
      break;
    case linuxcnc::v1::HAL_TYPE_S32:
      if (source.value_case() == linuxcnc::v1::HalScalar::kS32)
        return HalAdapterValue{static_cast<std::int32_t>(source.s32())};
      break;
    case linuxcnc::v1::HAL_TYPE_U32:
      if (source.value_case() == linuxcnc::v1::HalScalar::kU32)
        return HalAdapterValue{static_cast<std::uint32_t>(source.u32())};
      break;
    case linuxcnc::v1::HAL_TYPE_S64:
      if (source.value_case() == linuxcnc::v1::HalScalar::kS64)
        return HalAdapterValue{static_cast<std::int64_t>(source.s64())};
      break;
    case linuxcnc::v1::HAL_TYPE_U64:
      if (source.value_case() == linuxcnc::v1::HalScalar::kU64)
        return HalAdapterValue{static_cast<std::uint64_t>(source.u64())};
      break;
    default:
      break;
  }
  return std::nullopt;
}

void encode_hal_scalar(const HalAdapterValue& source,
                       linuxcnc::v1::HalScalar* target) {
  target->Clear();
  if (const auto* value = std::get_if<bool>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_BIT);
    target->set_bit(*value);
  } else if (const auto* value = std::get_if<double>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_FLOAT);
    target->set_float_value(*value);
  } else if (const auto* value = std::get_if<std::int32_t>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_S32);
    target->set_s32(*value);
  } else if (const auto* value = std::get_if<std::uint32_t>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_U32);
    target->set_u32(*value);
  } else if (const auto* value = std::get_if<std::int64_t>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_S64);
    target->set_s64(*value);
  } else if (const auto* value = std::get_if<std::uint64_t>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_U64);
    target->set_u64(*value);
  }
}

void encode_hal_topology(const HalAdapterTopology& source,
                         linuxcnc::v1::HalTopology* target) {
  target->Clear();
  for (const auto& component : source.components) {
    auto* encoded = target->add_components();
    encoded->set_id(component.id);
    encoded->set_name(component.name);
    encoded->set_kind(encode_component_kind(component.kind));
    encoded->set_ready(component.ready);
    if (component.pid) encoded->set_pid(*component.pid);
  }
  for (const auto& function : source.functions) {
    auto* encoded = target->add_functions();
    encoded->set_name(function.name);
    encoded->set_owner_id(function.owner_id);
    encoded->set_owner_name(function.owner_name);
    encoded->set_uses_fp(function.uses_fp);
    encoded->set_reentrant(function.reentrant);
    encoded->set_users(function.users);
    if (function.runtime) encoded->set_runtime(*function.runtime);
    encoded->set_max_runtime(function.max_runtime);
    encoded->set_max_runtime_increased(function.max_runtime_increased);
  }
  for (const auto& thread : source.threads) {
    auto* encoded = target->add_threads();
    encoded->set_name(thread.name);
    encoded->set_period_ns(static_cast<std::uint64_t>(thread.period_ns));
    encoded->set_priority(thread.priority);
    encoded->set_uses_fp(thread.uses_fp);
    encoded->set_running(thread.running);
    if (thread.runtime) encoded->set_runtime(*thread.runtime);
    encoded->set_max_runtime(thread.max_runtime);
    for (const auto& function : thread.functions)
      encoded->add_functions(function);
  }
  for (const auto& pin : source.pins) {
    auto* encoded = target->add_pins();
    encoded->set_name(pin.name);
    encode_hal_scalar(pin.value, encoded->mutable_value());
    encoded->set_type(encode_type(pin.type));
    encoded->set_direction(encode_pin_direction(pin.direction));
    encoded->set_owner_id(pin.owner_id);
    if (pin.signal_name) encoded->set_signal_name(*pin.signal_name);
  }
  for (const auto& parameter : source.params) {
    auto* encoded = target->add_params();
    encoded->set_name(parameter.name);
    encode_hal_scalar(parameter.value, encoded->mutable_value());
    encoded->set_type(encode_type(parameter.type));
    encoded->set_direction(encode_param_direction(parameter.direction));
    encoded->set_owner_id(parameter.owner_id);
  }
  for (const auto& signal : source.signals) {
    auto* encoded = target->add_signals();
    encoded->set_name(signal.name);
    encode_hal_scalar(signal.value, encoded->mutable_value());
    encoded->set_type(encode_type(signal.type));
    if (signal.driver) encoded->set_driver(*signal.driver);
    encoded->set_readers(static_cast<std::uint32_t>(signal.readers));
    encoded->set_writers(static_cast<std::uint32_t>(signal.writers));
    encoded->set_bidirs(static_cast<std::uint32_t>(signal.bidirs));
  }
}

}  // namespace linuxcnc::server
