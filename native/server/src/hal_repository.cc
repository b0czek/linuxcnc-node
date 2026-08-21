#include "linuxcnc_grpc/hal_repository.hpp"

#include <algorithm>

namespace linuxcnc::server {

bool HalRepository::add_item(HalItem item) {
  if (item.name.empty() || !same_type(item.type, item.value)) return false;
  std::lock_guard lock(mutex_);
  if (items_.find(item.name) != items_.end()) return false;
  items_.emplace(item.name, std::move(item));
  ++generation_;
  return true;
}

bool HalRepository::remove_item(const std::string& name) {
  std::lock_guard lock(mutex_);
  if (items_.erase(name) == 0) return false;
  ++generation_;
  return true;
}

bool HalRepository::read(const std::string& name, HalValue* value) const {
  std::lock_guard lock(mutex_);
  const auto found = items_.find(name);
  if (found == items_.end()) return false;
  if (value) *value = found->second.value;
  return true;
}

std::vector<HalUpdate> HalRepository::read_many(const std::vector<std::string>& names) const {
  std::vector<HalUpdate> result;
  std::lock_guard lock(mutex_);
  result.reserve(names.size());
  for (const auto& name : names) {
    const auto found = items_.find(name);
    if (found != items_.end()) result.push_back(HalUpdate{name, found->second.value});
  }
  return result;
}

bool HalRepository::write(const std::string& name, HalValue value) {
  std::lock_guard lock(mutex_);
  const auto found = items_.find(name);
  if (found == items_.end() || !found->second.writable ||
      !same_type(found->second.type, value)) {
    return false;
  }
  found->second.value = std::move(value);
  return true;
}

std::size_t HalRepository::write_many(const std::vector<HalUpdate>& updates) {
  std::lock_guard lock(mutex_);
  std::size_t written = 0;
  for (const auto& update : updates) {
    const auto found = items_.find(update.name);
    if (found == items_.end() || !found->second.writable ||
        !same_type(found->second.type, update.value)) {
      continue;
    }
    found->second.value = update.value;
    ++written;
  }
  return written;
}

HalTopology HalRepository::topology() const {
  std::lock_guard lock(mutex_);
  HalTopology result;
  result.generation = generation_;
  result.items.reserve(items_.size());
  for (const auto& [name, item] : items_) result.items.push_back(item);
  std::sort(result.items.begin(), result.items.end(),
            [](const HalItem& left, const HalItem& right) { return left.name < right.name; });
  return result;
}

std::uint64_t HalRepository::generation() const {
  std::lock_guard lock(mutex_);
  return generation_;
}

bool HalRepository::same_type(HalScalarType type, const HalValue& value) {
  switch (type) {
    case HalScalarType::Bit: return std::holds_alternative<bool>(value);
    case HalScalarType::Float: return std::holds_alternative<double>(value);
    case HalScalarType::S32: return std::holds_alternative<std::int32_t>(value);
    case HalScalarType::U32: return std::holds_alternative<std::uint32_t>(value);
    case HalScalarType::S64: return std::holds_alternative<std::int64_t>(value);
    case HalScalarType::U64: return std::holds_alternative<std::uint64_t>(value);
  }
  return false;
}

}  // namespace linuxcnc::server
