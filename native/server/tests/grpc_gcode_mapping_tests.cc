#include "linuxcnc_grpc/grpc_gcode_mapping.hpp"

#include <cassert>
#include <vector>

using namespace linuxcnc::server;

int main() {
  gcode::ArcOp arc;
  arc.lineNumber = 17;
  arc.pos = {1, 2, 3, 4, 5, 6, 7, 8, 9};
  arc.plane = gcode::Plane::XZ;
  arc.arcData = {10, 11, -1, 12};
  linuxcnc::v1::GCodeOperation encoded;
  encode_gcode_operation(arc, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_ARC);
  assert(encoded.line_number() == 17);
  assert(encoded.pos().values_size() == 9);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kArc);
  assert(encoded.arc().plane() == linuxcnc::v1::PLANE_XZ);
  assert(encoded.arc().rotation() == -1);

  const std::vector<gcode::Operation> remaining{
      gcode::TraverseOp{}, gcode::FeedOp{}, gcode::ProbeOp{},
      gcode::RigidTapOp{}, gcode::DwellOp{}, gcode::NurbsG5Op{},
      gcode::NurbsG6Op{}, gcode::UnitsChangeOp{}, gcode::PlaneChangeOp{},
      gcode::G5xOffsetOp{}, gcode::G92OffsetOp{}, gcode::XYRotationOp{},
      gcode::ToolOffsetOp{}, gcode::ToolChangeOp{}, gcode::FeedRateChangeOp{}};
  for (const auto& operation : remaining) {
    encode_gcode_operation(operation, &encoded);
    assert(encoded.type() != linuxcnc::v1::OPERATION_TYPE_UNSPECIFIED);
  }

  gcode::Extents extents;
  extents.min = {-1, -2, -3};
  extents.max = {4, 5, 6};
  linuxcnc::v1::Extents encoded_extents;
  encode_gcode_extents(extents, &encoded_extents);
  assert(encoded_extents.min().values_size() == 3);
  assert(encoded_extents.min().values(2) == -3);
  assert(encoded_extents.max().values(0) == 4);
  return 0;
}
