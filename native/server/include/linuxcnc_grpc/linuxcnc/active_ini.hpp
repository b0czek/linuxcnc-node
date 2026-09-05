#pragma once
#include <filesystem>
#include <string>
#include <vector>

namespace linuxcnc::server {
struct IniEntry {
  std::string section;
  std::string key;
  std::string value;
  bool operator==(const IniEntry&) const = default;
};

class ActiveIni {
 public:
  explicit ActiveIni(const std::filesystem::path& path);
  const std::vector<IniEntry>& entries() const noexcept { return entries_; }
 private:
  std::vector<IniEntry> entries_;
};
}  // namespace linuxcnc::server
