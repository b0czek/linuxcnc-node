#pragma once

#include "linuxcnc/v1/program.pb.h"
#include "linuxcnc_grpc/gcode/operation_types.hpp"

namespace linuxcnc::server {

void encode_gcode_position(const gcode::Position& source,
                           linuxcnc::v1::Position* target);
void encode_gcode_operation(const gcode::Operation& source,
                            linuxcnc::v1::GCodeOperation* target);
void encode_gcode_extents(const gcode::Extents& source,
                          linuxcnc::v1::Extents* target);

}  // namespace linuxcnc::server
