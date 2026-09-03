#pragma once

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace linuxcnc::server {

enum class IniConversionStatus { Found, Missing, Invalid };

template <typename Value>
struct IniConversion {
  IniConversionStatus status = IniConversionStatus::Missing;
  Value value{};
};

// Immutable snapshot of the active LinuxCNC INI. The implementation uses the
// same cached parser that backs linuxcnc.ini, including #INCLUDE handling and
// LinuxCNC's conversion rules.
class ActiveIni {
 public:
  explicit ActiveIni(const std::filesystem::path& path);
  ~ActiveIni();

  ActiveIni(const ActiveIni&) = delete;
  ActiveIni& operator=(const ActiveIni&) = delete;

  std::optional<std::string> find(const std::string& section,
                                  const std::string& key,
                                  std::size_t occurrence = 1) const;
  std::vector<std::string> find_all(const std::string& section,
                                    const std::string& key) const;
  IniConversion<bool> get_bool(const std::string& section,
                               const std::string& key,
                               std::size_t occurrence = 1) const;
  IniConversion<std::int64_t> get_int(const std::string& section,
                                      const std::string& key,
                                      std::size_t occurrence = 1) const;
  IniConversion<std::uint64_t> get_uint(const std::string& section,
                                        const std::string& key,
                                        std::size_t occurrence = 1) const;
  IniConversion<double> get_float(const std::string& section,
                                  const std::string& key,
                                  std::size_t occurrence = 1) const;

 private:
  class Impl;
  std::unique_ptr<const Impl> impl_;
};

}  // namespace linuxcnc::server
