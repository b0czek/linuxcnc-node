#pragma once

#include "linuxcnc_grpc/gcode_operation_types.hpp"

#include "linuxcnc/v1/linuxcnc.pb.h"

namespace linuxcnc::server {

void encode_gcode_position(const gcode::Position& source,
                           linuxcnc::v1::Position* target);
void encode_gcode_operation(const gcode::Operation& source,
                            linuxcnc::v1::GCodeOperation* target);
void encode_gcode_extents(const gcode::Extents& source,
                          linuxcnc::v1::Extents* target);

}  // namespace linuxcnc::server
