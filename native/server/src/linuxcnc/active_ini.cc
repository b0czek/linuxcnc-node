#include "linuxcnc_grpc/linuxcnc/active_ini.hpp"

#include <stdexcept>

#include "inifile.hh"
#include "linuxcnc_grpc/daemon/config.hpp"

namespace linuxcnc::server {
ActiveIni::ActiveIni(const std::filesystem::path& path)
    : ini_(std::make_unique<const ::linuxcnc::IniFile>(path.string())) {
  if (!*ini_) throw std::runtime_error("cannot load active LinuxCNC INI");
  for (const auto& section : ini_->findSections()) {
    for (const auto& [key, value] : ini_->findVariables(section)) {
      entries_.push_back({section, key, value});
    }
  }
}

ActiveIni::~ActiveIni() = default;

std::optional<std::string> ActiveIni::find_string(
    const std::string& section, const std::string& key) const {
  return ini_->findString(key, section);
}

bool validate_program_prefix(const std::filesystem::path& ini_file,
                             const std::filesystem::path& active_directory,
                             std::string* error) {
  const auto fail = [error](const std::string& message) {
    if (error) *error = message;
    return false;
  };
  std::optional<std::string> configured_prefix;
  try {
    configured_prefix =
        ActiveIni(ini_file).find_string("DISPLAY", "PROGRAM_PREFIX");
  } catch (const std::runtime_error&) {
    return fail("cannot read LinuxCNC INI: " + ini_file.string());
  }
  if (!configured_prefix || configured_prefix->empty())
    return fail("[DISPLAY] PROGRAM_PREFIX is missing from LinuxCNC INI");
  std::filesystem::path configured_path(*configured_prefix);
  if (configured_path.is_relative())
    configured_path = ini_file.parent_path() / configured_path;
  const auto configured = std::filesystem::weakly_canonical(
      std::filesystem::absolute(configured_path));
  const auto expected = std::filesystem::weakly_canonical(
      std::filesystem::absolute(active_directory));
  if (configured != expected) {
    return fail(
        "LinuxCNC PROGRAM_PREFIX does not match active program directory");
  }
  return true;
}
}  // namespace linuxcnc::server
