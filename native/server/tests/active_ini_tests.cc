#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

#include <cassert>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>

#include "linuxcnc_grpc/linuxcnc/active_ini.hpp"

using linuxcnc::server::ActiveIni;
using linuxcnc::server::IniConversionStatus;
namespace fs = std::filesystem;

int main() {
  const auto root = fs::temp_directory_path() /
                    ("linuxcnc-active-ini-" + std::to_string(::getpid()));
  fs::create_directory(root);
  const auto ini_path = root / "active.ini";
  {
    std::ofstream output(ini_path);
    output << "[TEST]\n"
              "REPEATED = first\n"
              "REPEATED = second\n"
              "BOOL_TRUE = yes\n"
              "BOOL_FALSE = OFF\n"
              "BOOL_INVALID = perhaps\n"
              "INT = -42\n"
              "UINT = 42\n"
              "UINT_INVALID = not-a-number\n"
              "FLOAT = 2.5\n";
  }

  ActiveIni ini(ini_path);
  assert(!ini.find("TEST", "MISSING"));
  assert(ini.find("TEST", "REPEATED") == "first");
  assert(ini.find("TEST", "REPEATED", 2) == "second");
  const auto repeated = ini.find_all("TEST", "REPEATED");
  assert(repeated.size() == 2);
  assert(repeated[0] == "first" && repeated[1] == "second");

  const auto true_value = ini.get_bool("TEST", "BOOL_TRUE");
  const auto false_value = ini.get_bool("TEST", "BOOL_FALSE");
  assert(true_value.status == IniConversionStatus::Found && true_value.value);
  assert(false_value.status == IniConversionStatus::Found &&
         !false_value.value);
  const auto integer = ini.get_int("TEST", "INT");
  const auto unsigned_integer = ini.get_uint("TEST", "UINT");
  const auto real = ini.get_float("TEST", "FLOAT");
  assert(integer.status == IniConversionStatus::Found && integer.value == -42);
  assert(unsigned_integer.status == IniConversionStatus::Found &&
         unsigned_integer.value == 42);
  assert(real.status == IniConversionStatus::Found && real.value == 2.5);

  assert(ini.get_bool("TEST", "MISSING").status ==
         IniConversionStatus::Missing);
  assert(ini.get_bool("TEST", "BOOL_INVALID").status ==
         IniConversionStatus::Invalid);
  assert(ini.get_uint("TEST", "UINT_INVALID").status ==
         IniConversionStatus::Invalid);

  // LinuxCNC's parser cache makes an already loaded INI immutable even when
  // the underlying file changes during the server session.
  {
    std::ofstream output(ini_path, std::ios::trunc);
    output << "[TEST]\nREPEATED = changed\n";
  }
  assert(ini.find("TEST", "REPEATED") == "first");

  bool missing_failed = false;
  try {
    ActiveIni missing(root / "missing.ini");
  } catch (const std::runtime_error&) {
    missing_failed = true;
  }
  assert(missing_failed);

  const auto unreadable_path = root / "unreadable.ini";
  {
    std::ofstream output(unreadable_path);
    output << "[TEST]\nVALUE = present\n";
  }
  assert(::chmod(unreadable_path.c_str(), 0) == 0);
  if (::geteuid() == 0) {
    // Root bypasses ordinary mode checks, so exercise the same constructor in
    // a privilege-dropped child when tests run in a container as root.
    assert(::chmod(root.c_str(),
                   S_IRUSR | S_IWUSR | S_IXUSR | S_IROTH | S_IXOTH) == 0);
    const pid_t child = ::fork();
    assert(child >= 0);
    if (child == 0) {
      if (::setgid(65534) != 0 || ::setuid(65534) != 0) _exit(2);
      try {
        ActiveIni unreadable(unreadable_path);
        _exit(1);
      } catch (const std::runtime_error&) {
        _exit(0);
      }
    }
    int status = 0;
    assert(::waitpid(child, &status, 0) == child);
    assert(WIFEXITED(status) && WEXITSTATUS(status) == 0);
  } else {
    bool unreadable_failed = false;
    try {
      ActiveIni unreadable(unreadable_path);
    } catch (const std::runtime_error&) {
      unreadable_failed = true;
    }
    assert(unreadable_failed);
  }
  assert(::chmod(unreadable_path.c_str(), S_IRUSR | S_IWUSR) == 0);

  fs::remove_all(root);
  return 0;
}
