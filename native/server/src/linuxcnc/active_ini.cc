#include "linuxcnc_grpc/linuxcnc/active_ini.hpp"

#include <limits>
#include <stdexcept>

#include "inifile.hh"

namespace linuxcnc::server {
namespace {

int checked_occurrence(std::size_t occurrence) {
  if (occurrence == 0 ||
      occurrence > static_cast<std::size_t>(std::numeric_limits<int>::max())) {
    throw std::out_of_range("INI occurrence is outside LinuxCNC's range");
  }
  return static_cast<int>(occurrence);
}

template <typename Value, typename Convert>
IniConversion<Value> convert(const ::linuxcnc::IniFile& ini,
                             const std::string& section, const std::string& key,
                             std::size_t occurrence, Convert&& conversion) {
  const int number = checked_occurrence(occurrence);
  if (!ini.findString(number, key, section)) {
    return {IniConversionStatus::Missing, {}};
  }
  if (auto value = conversion(number)) {
    return {IniConversionStatus::Found, static_cast<Value>(*value)};
  }
  return {IniConversionStatus::Invalid, {}};
}

}  // namespace

class ActiveIni::Impl {
 public:
  explicit Impl(const std::string& path) : ini(path) {
    if (!ini) throw std::runtime_error("cannot load active LinuxCNC INI");
  }

  const ::linuxcnc::IniFile ini;
};

ActiveIni::ActiveIni(const std::filesystem::path& path)
    : impl_(std::make_unique<const Impl>(path.string())) {}

ActiveIni::~ActiveIni() = default;

std::optional<std::string> ActiveIni::find(const std::string& section,
                                           const std::string& key,
                                           std::size_t occurrence) const {
  return impl_->ini.findString(checked_occurrence(occurrence), key, section);
}

std::vector<std::string> ActiveIni::find_all(const std::string& section,
                                             const std::string& key) const {
  return impl_->ini.findStringAll(key, section);
}

IniConversion<bool> ActiveIni::get_bool(const std::string& section,
                                        const std::string& key,
                                        std::size_t occurrence) const {
  return convert<bool>(impl_->ini, section, key, occurrence, [&](int number) {
    return impl_->ini.findBool(number, key, section);
  });
}

IniConversion<std::int64_t> ActiveIni::get_int(const std::string& section,
                                               const std::string& key,
                                               std::size_t occurrence) const {
  return convert<std::int64_t>(
      impl_->ini, section, key, occurrence,
      [&](int number) { return impl_->ini.findSInt(number, key, section); });
}

IniConversion<std::uint64_t> ActiveIni::get_uint(const std::string& section,
                                                 const std::string& key,
                                                 std::size_t occurrence) const {
  return convert<std::uint64_t>(
      impl_->ini, section, key, occurrence,
      [&](int number) { return impl_->ini.findUInt(number, key, section); });
}

IniConversion<double> ActiveIni::get_float(const std::string& section,
                                           const std::string& key,
                                           std::size_t occurrence) const {
  return convert<double>(impl_->ini, section, key, occurrence, [&](int number) {
    return impl_->ini.findReal(number, key, section);
  });
}

}  // namespace linuxcnc::server
