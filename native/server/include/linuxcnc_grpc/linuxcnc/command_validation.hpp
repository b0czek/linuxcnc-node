#pragma once

#include <string>

#include "linuxcnc_grpc/linuxcnc/nml_adapter.hpp"

namespace linuxcnc::server {

enum class NmlCommandValidationCode {
  Valid,
  InvalidArgument,
  StatusUnavailable,
};

struct NmlCommandValidation {
  NmlCommandValidationCode code = NmlCommandValidationCode::Valid;
  std::string message;

  explicit operator bool() const noexcept {
    return code == NmlCommandValidationCode::Valid;
  }
};

// Validates every physical value and every dynamically configured index before
// an NML message is allocated or assigned a serial number. Commands that need
// machine configuration return StatusUnavailable until a status snapshot has
// been observed.
NmlCommandValidation validate_nml_command(
    const NmlCommand& command, const NmlStatusSnapshot* configuration);

}  // namespace linuxcnc::server
