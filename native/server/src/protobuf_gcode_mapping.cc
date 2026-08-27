#include "linuxcnc_grpc/protobuf_gcode_mapping.hpp"

#include <type_traits>

namespace linuxcnc::server {
namespace {

void encode_position3(const gcode::Position3& source,
                      linuxcnc::v1::Position* target) {
  target->clear_values();
  target->add_values(source.x);
  target->add_values(source.y);
  target->add_values(source.z);
}

}  // namespace

void encode_gcode_position(const gcode::Position& source,
                           linuxcnc::v1::Position* target) {
  target->clear_values();
  target->add_values(source.x);
  target->add_values(source.y);
  target->add_values(source.z);
  target->add_values(source.a);
  target->add_values(source.b);
  target->add_values(source.c);
  target->add_values(source.u);
  target->add_values(source.v);
  target->add_values(source.w);
}

void encode_gcode_operation(const gcode::Operation& source,
                            linuxcnc::v1::GCodeOperation* target) {
  target->Clear();
  target->set_type(static_cast<linuxcnc::v1::OperationType>(
      static_cast<int>(gcode::getOperationType(source))));
  std::visit(
      [target](const auto& operation) {
        using T = std::decay_t<decltype(operation)>;
        if constexpr (std::is_same_v<T, gcode::TraverseOp> ||
                      std::is_same_v<T, gcode::FeedOp>) {
          target->set_line_number(operation.lineNumber);
          encode_gcode_position(operation.pos, target->mutable_pos());
        } else if constexpr (std::is_same_v<T, gcode::ArcOp>) {
          target->set_line_number(operation.lineNumber);
          encode_gcode_position(operation.pos, target->mutable_pos());
          auto* arc = target->mutable_arc();
          arc->set_plane(static_cast<linuxcnc::v1::Plane>(operation.plane));
          arc->set_center_first(operation.arcData.centerFirst);
          arc->set_center_second(operation.arcData.centerSecond);
          arc->set_rotation(operation.arcData.rotation);
          arc->set_axis_end_point(operation.arcData.axisEndPoint);
        } else if constexpr (std::is_same_v<T, gcode::ProbeOp>) {
          target->set_line_number(operation.lineNumber);
          encode_gcode_position(operation.pos, target->mutable_pos());
          target->mutable_probe();
        } else if constexpr (std::is_same_v<T, gcode::RigidTapOp>) {
          target->set_line_number(operation.lineNumber);
          encode_position3(operation.pos, target->mutable_pos());
          encode_position3(operation.pos,
                           target->mutable_rigid_tap()->mutable_pos());
          target->mutable_rigid_tap()->set_scale(operation.scale);
        } else if constexpr (std::is_same_v<T, gcode::DwellOp>) {
          encode_gcode_position(operation.pos, target->mutable_pos());
          target->mutable_dwell()->set_duration(operation.duration);
          target->mutable_dwell()->set_plane(
              static_cast<linuxcnc::v1::Plane>(operation.plane));
        } else if constexpr (std::is_same_v<T, gcode::NurbsG5Op>) {
          target->set_line_number(operation.lineNumber);
          encode_gcode_position(operation.pos, target->mutable_pos());
          auto* data = target->mutable_nurbs_g5();
          data->set_plane(static_cast<linuxcnc::v1::Plane>(operation.plane));
          data->set_order(static_cast<int>(operation.nurbsData.order));
          for (const auto& point : operation.nurbsData.controlPoints) {
            auto* encoded = data->add_control_points();
            encoded->set_x(point.x);
            encoded->set_y(point.y);
            encoded->set_weight(point.weight);
          }
        } else if constexpr (std::is_same_v<T, gcode::NurbsG6Op>) {
          target->set_line_number(operation.lineNumber);
          encode_gcode_position(operation.pos, target->mutable_pos());
          auto* data = target->mutable_nurbs_g6();
          data->set_plane(static_cast<linuxcnc::v1::Plane>(operation.plane));
          data->set_order(static_cast<int>(operation.nurbsData.order));
          data->set_interpolation_method(
              operation.nurbsData.interpolationMethod);
          for (const auto& point : operation.nurbsData.controlPoints) {
            auto* encoded = data->add_control_points();
            encoded->set_x(point.x);
            encoded->set_y(point.y);
            encoded->set_r(point.r);
            encoded->set_k(point.k);
          }
        } else if constexpr (std::is_same_v<T, gcode::UnitsChangeOp>) {
          target->mutable_units_change()->set_units(
              static_cast<linuxcnc::v1::ProgramUnits>(operation.units));
        } else if constexpr (std::is_same_v<T, gcode::PlaneChangeOp>) {
          target->mutable_plane_change()->set_plane(
              static_cast<linuxcnc::v1::Plane>(operation.plane));
        } else if constexpr (std::is_same_v<T, gcode::G5xOffsetOp>) {
          target->mutable_g5x_offset()->set_origin(operation.origin);
          encode_gcode_position(operation.offset,
                                target->mutable_g5x_offset()->mutable_offset());
        } else if constexpr (std::is_same_v<T, gcode::G92OffsetOp>) {
          encode_gcode_position(operation.offset,
                                target->mutable_g92_offset()->mutable_offset());
        } else if constexpr (std::is_same_v<T, gcode::XYRotationOp>) {
          target->mutable_xy_rotation()->set_rotation(operation.rotation);
        } else if constexpr (std::is_same_v<T, gcode::ToolOffsetOp>) {
          encode_gcode_position(
              operation.offset,
              target->mutable_tool_offset()->mutable_offset());
        } else if constexpr (std::is_same_v<T, gcode::ToolChangeOp>) {
          target->mutable_tool_change()->set_tool_number(operation.toolNumber);
        } else if constexpr (std::is_same_v<T, gcode::FeedRateChangeOp>) {
          target->mutable_feed_rate_change()->set_feed_rate(operation.feedRate);
        } else if constexpr (std::is_same_v<
                                 T, gcode::CutterCompensationChangeOp>) {
          target->mutable_cutter_compensation_change()->set_mode(
              static_cast<linuxcnc::v1::CutterCompensationMode>(
                  operation.mode));
        }
      },
      source);
}

void encode_gcode_extents(const gcode::Extents& source,
                          linuxcnc::v1::Extents* target) {
  encode_position3(source.min, target->mutable_min());
  encode_position3(source.max, target->mutable_max());
}

}  // namespace linuxcnc::server
