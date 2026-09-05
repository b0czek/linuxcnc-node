#include "linuxcnc_grpc/linuxcnc/active_ini.hpp"

#include <stdexcept>

#include "inifile.hh"

namespace linuxcnc::server {
ActiveIni::ActiveIni(const std::filesystem::path& path) {
  const ::linuxcnc::IniFile ini(path.string());
  if (!ini) throw std::runtime_error("cannot load active LinuxCNC INI");
  for (const auto& section : ini.findSections()) {
    for (const auto& [key, value] : ini.findVariables(section)) {
      entries_.push_back({section, key, value});
    }
  }
}
}  // namespace linuxcnc::server
