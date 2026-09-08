#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "linuxcnc/v1/machine.grpc.pb.h"
#include "linuxcnc_grpc/linuxcnc/nml_adapter.hpp"

namespace linuxcnc::server::detail {

struct EncodedStatus {
  ::linuxcnc::v1::LinuxCNCStat message;
  std::string serialized;
  std::string task_serialized;
  std::string motion_serialized;
  std::string trajectory_serialized;
  std::string io_serialized;
  std::vector<std::string> joints_serialized;
  std::vector<std::string> axes_serialized;
  std::vector<std::string> spindles_serialized;
  std::vector<std::string> tools_serialized;
};

EncodedStatus encode_status(const NmlStatusSnapshot& source);

std::optional<::linuxcnc::v1::LinuxCNCStatDelta> make_status_delta(
    const EncodedStatus& previous, const EncodedStatus& current,
    std::uint64_t sequence);

}  // namespace linuxcnc::server::detail
