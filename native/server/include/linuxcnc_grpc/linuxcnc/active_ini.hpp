#pragma once
#include <filesystem>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace linuxcnc {
class IniFile;
}

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
  ~ActiveIni();

  ActiveIni(const ActiveIni&) = delete;
  ActiveIni& operator=(const ActiveIni&) = delete;

  const std::vector<IniEntry>& entries() const noexcept { return entries_; }
  std::optional<std::string> find_string(const std::string& section,
                                         const std::string& key) const;

 private:
  std::unique_ptr<const ::linuxcnc::IniFile> ini_;
  std::vector<IniEntry> entries_;
};
}  // namespace linuxcnc::server
