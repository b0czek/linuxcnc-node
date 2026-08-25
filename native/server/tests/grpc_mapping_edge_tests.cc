#include <cassert>
#include <cstdint>
#include <optional>
#include <string>
#include <variant>
#include <vector>

#include "linuxcnc_grpc/hal/grpc/mapping.hpp"
#include "linuxcnc_grpc/protobuf_gcode_mapping.hpp"

using namespace linuxcnc::server;

namespace {

gcode::Position full_position() {
  return gcode::Position{1.0, -2.0, 3.0, -4.0, 5.0, -6.0, 7.0, -8.0, 9.0};
}

void assert_position(const linuxcnc::v1::Position& encoded,
                     const std::vector<double>& expected) {
  assert(encoded.values_size() == static_cast<int>(expected.size()));
  for (int index = 0; index < encoded.values_size(); ++index) {
    assert(encoded.values(index) == expected[static_cast<std::size_t>(index)]);
  }
}

void gcode_mapping_all_variants_test() {
  linuxcnc::v1::GCodeOperation encoded;

  gcode::TraverseOp traverse;
  traverse.lineNumber = 11;
  traverse.pos = full_position();
  encode_gcode_operation(traverse, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_TRAVERSE);
  assert(encoded.line_number() == 11);
  assert_position(encoded.pos(),
                  {1.0, -2.0, 3.0, -4.0, 5.0, -6.0, 7.0, -8.0, 9.0});
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::DATA_NOT_SET);

  gcode::FeedOp feed;
  feed.lineNumber = 12;
  feed.pos = full_position();
  encode_gcode_operation(feed, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_FEED);
  assert(encoded.line_number() == 12);
  assert_position(encoded.pos(),
                  {1.0, -2.0, 3.0, -4.0, 5.0, -6.0, 7.0, -8.0, 9.0});

  gcode::ArcOp arc;
  arc.lineNumber = 13;
  arc.pos = full_position();
  arc.plane = gcode::Plane::UW;
  arc.arcData = {-1.5, 2.5, -3, 4.5};
  encode_gcode_operation(arc, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_ARC);
  assert(encoded.line_number() == 13);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kArc);
  assert(encoded.arc().plane() == linuxcnc::v1::PLANE_UW);
  assert(encoded.arc().center_first() == -1.5);
  assert(encoded.arc().center_second() == 2.5);
  assert(encoded.arc().rotation() == -3.0);
  assert(encoded.arc().axis_end_point() == 4.5);

  gcode::ProbeOp probe;
  probe.lineNumber = 14;
  probe.pos = full_position();
  encode_gcode_operation(probe, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_PROBE);
  assert(encoded.line_number() == 14);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kProbe);

  gcode::RigidTapOp rigid_tap;
  rigid_tap.lineNumber = 15;
  rigid_tap.pos = {-1.0, 2.0, -3.0};
  rigid_tap.scale = 0.25;
  encode_gcode_operation(rigid_tap, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_RIGID_TAP);
  assert(encoded.line_number() == 15);
  assert_position(encoded.pos(), {-1.0, 2.0, -3.0});
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kRigidTap);
  assert_position(encoded.rigid_tap().pos(), {-1.0, 2.0, -3.0});
  assert(encoded.rigid_tap().scale() == 0.25);

  gcode::DwellOp dwell;
  dwell.pos = full_position();
  dwell.duration = 12.5;
  dwell.plane = gcode::Plane::YZ;
  encode_gcode_operation(dwell, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_DWELL);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kDwell);
  assert(encoded.dwell().duration() == 12.5);
  assert(encoded.dwell().plane() == linuxcnc::v1::PLANE_YZ);

  gcode::NurbsG5Op nurbs_g5;
  nurbs_g5.lineNumber = 17;
  nurbs_g5.pos = full_position();
  nurbs_g5.plane = gcode::Plane::XZ;
  nurbs_g5.nurbsData.order = 3;
  nurbs_g5.nurbsData.controlPoints = {{1.0, 2.0, 0.5}, {-3.0, 4.0, 1.25}};
  encode_gcode_operation(nurbs_g5, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_NURBS_G5);
  assert(encoded.line_number() == 17);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kNurbsG5);
  assert(encoded.nurbs_g5().plane() == linuxcnc::v1::PLANE_XZ);
  assert(encoded.nurbs_g5().order() == 3);
  assert(encoded.nurbs_g5().control_points_size() == 2);
  assert(encoded.nurbs_g5().control_points(1).x() == -3.0);
  assert(encoded.nurbs_g5().control_points(1).weight() == 1.25);

  gcode::NurbsG6Op nurbs_g6;
  nurbs_g6.lineNumber = 18;
  nurbs_g6.pos = full_position();
  nurbs_g6.plane = gcode::Plane::VW;
  nurbs_g6.nurbsData.order = 4;
  nurbs_g6.nurbsData.controlPoints = {{1.0, -2.0, 3.0, -4.0}};
  encode_gcode_operation(nurbs_g6, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_NURBS_G6);
  assert(encoded.line_number() == 18);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kNurbsG6);
  assert(encoded.nurbs_g6().plane() == linuxcnc::v1::PLANE_VW);
  assert(encoded.nurbs_g6().order() == 4);
  assert(encoded.nurbs_g6().control_points_size() == 1);
  assert(encoded.nurbs_g6().control_points(0).r() == 3.0);
  assert(encoded.nurbs_g6().control_points(0).k() == -4.0);

  gcode::UnitsChangeOp units;
  units.units = gcode::Units::CM;
  encode_gcode_operation(units, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_UNITS_CHANGE);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kUnitsChange);
  assert(encoded.units_change().units() == linuxcnc::v1::PROGRAM_UNITS_CM);

  gcode::PlaneChangeOp plane;
  plane.plane = gcode::Plane::UV;
  encode_gcode_operation(plane, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_PLANE_CHANGE);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kPlaneChange);
  assert(encoded.plane_change().plane() == linuxcnc::v1::PLANE_UV);

  gcode::G5xOffsetOp g5x;
  g5x.origin = -7;
  g5x.offset = full_position();
  encode_gcode_operation(g5x, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_G5X_OFFSET);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kG5XOffset);
  assert(encoded.g5x_offset().origin() == -7);
  assert_position(encoded.g5x_offset().offset(),
                  {1.0, -2.0, 3.0, -4.0, 5.0, -6.0, 7.0, -8.0, 9.0});

  gcode::G92OffsetOp g92;
  g92.offset = full_position();
  encode_gcode_operation(g92, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_G92_OFFSET);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kG92Offset);
  assert_position(encoded.g92_offset().offset(),
                  {1.0, -2.0, 3.0, -4.0, 5.0, -6.0, 7.0, -8.0, 9.0});

  gcode::XYRotationOp rotation;
  rotation.rotation = -45.5;
  encode_gcode_operation(rotation, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_XY_ROTATION);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kXyRotation);
  assert(encoded.xy_rotation().rotation() == -45.5);

  gcode::ToolOffsetOp tool_offset;
  tool_offset.offset = full_position();
  encode_gcode_operation(tool_offset, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_TOOL_OFFSET);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kToolOffset);
  assert_position(encoded.tool_offset().offset(),
                  {1.0, -2.0, 3.0, -4.0, 5.0, -6.0, 7.0, -8.0, 9.0});

  gcode::ToolChangeOp tool_change;
  tool_change.toolNumber = -99;
  encode_gcode_operation(tool_change, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_TOOL_CHANGE);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kToolChange);
  assert(encoded.tool_change().tool_number() == -99);

  gcode::FeedRateChangeOp feed_rate;
  feed_rate.feedRate = 123.75;
  encode_gcode_operation(feed_rate, &encoded);
  assert(encoded.type() == linuxcnc::v1::OPERATION_TYPE_FEED_RATE_CHANGE);
  assert(encoded.data_case() == linuxcnc::v1::GCodeOperation::kFeedRateChange);
  assert(encoded.feed_rate_change().feed_rate() == 123.75);

  linuxcnc::v1::Position position;
  encode_gcode_position(full_position(), &position);
  assert_position(position, {1.0, -2.0, 3.0, -4.0, 5.0, -6.0, 7.0, -8.0, 9.0});
  gcode::Extents extents;
  extents.min = {-1.0, -2.0, -3.0};
  extents.max = {4.0, 5.0, 6.0};
  linuxcnc::v1::Extents encoded_extents;
  encode_gcode_extents(extents, &encoded_extents);
  assert_position(encoded_extents.min(), {-1.0, -2.0, -3.0});
  assert_position(encoded_extents.max(), {4.0, 5.0, 6.0});
}

template <typename T>
void assert_hal_round_trip(const T& source, linuxcnc::v1::HalType type) {
  linuxcnc::v1::HalScalar encoded;
  encode_hal_scalar(HalAdapterValue{source}, &encoded);
  assert(encoded.type() == type);
  const auto decoded = decode_hal_scalar(encoded);
  assert(decoded.has_value());
  assert(std::get<T>(*decoded) == source);
}

void hal_scalar_and_reference_mapping_test() {
  assert_hal_round_trip<bool>(true, linuxcnc::v1::HAL_TYPE_BIT);
  assert_hal_round_trip<double>(-123.5, linuxcnc::v1::HAL_TYPE_FLOAT);
  assert_hal_round_trip<std::int32_t>(-2147483647 - 1,
                                      linuxcnc::v1::HAL_TYPE_S32);
  assert_hal_round_trip<std::uint32_t>(4294967295U, linuxcnc::v1::HAL_TYPE_U32);
  assert_hal_round_trip<std::int64_t>(-9223372036854775807LL - 1,
                                      linuxcnc::v1::HAL_TYPE_S64);
  assert_hal_round_trip<std::uint64_t>(18446744073709551615ULL,
                                       linuxcnc::v1::HAL_TYPE_U64);

  linuxcnc::v1::HalScalar stale;
  encode_hal_scalar(HalAdapterValue{std::int64_t{-42}}, &stale);
  encode_hal_scalar(HalAdapterValue{std::uint64_t{18446744073709551615ULL}},
                    &stale);
  assert(stale.value_case() == linuxcnc::v1::HalScalar::kU64);
  assert(!decode_hal_scalar([] {
    linuxcnc::v1::HalScalar invalid;
    invalid.set_type(linuxcnc::v1::HAL_TYPE_S64);
    invalid.set_u64(12);
    return invalid;
  }()));
  assert(!decode_hal_scalar([] {
    linuxcnc::v1::HalScalar invalid;
    invalid.set_type(linuxcnc::v1::HAL_TYPE_UNSPECIFIED);
    invalid.set_bit(true);
    return invalid;
  }()));

  linuxcnc::v1::HalItemRef reference;
  reference.set_kind(linuxcnc::v1::HAL_ITEM_KIND_PIN);
  reference.set_name("motion.pin");
  const auto decoded_pin = decode_hal_reference(reference);
  assert(decoded_pin && decoded_pin->kind == HalAdapterItemKind::Pin);
  assert(decoded_pin->name == "motion.pin");
  reference.set_kind(linuxcnc::v1::HAL_ITEM_KIND_PARAM);
  const auto decoded_param = decode_hal_reference(reference);
  assert(decoded_param && decoded_param->kind == HalAdapterItemKind::Param);
  reference.set_kind(linuxcnc::v1::HAL_ITEM_KIND_SIGNAL);
  const auto decoded_signal = decode_hal_reference(reference);
  assert(decoded_signal && decoded_signal->kind == HalAdapterItemKind::Signal);
  reference.set_kind(linuxcnc::v1::HAL_ITEM_KIND_UNSPECIFIED);
  assert(!decode_hal_reference(reference));
  reference.set_kind(linuxcnc::v1::HAL_ITEM_KIND_PIN);
  reference.clear_name();
  assert(!decode_hal_reference(reference));
}

void hal_topology_mapping_test() {
  HalAdapterTopology topology;
  topology.components = {
      HalAdapterComponentInfo{1, "user", HalAdapterComponentKind::User, true,
                              42},
      HalAdapterComponentInfo{2, "rt", HalAdapterComponentKind::Realtime, false,
                              std::nullopt},
      HalAdapterComponentInfo{3, "other", HalAdapterComponentKind::Other, true,
                              std::nullopt},
      HalAdapterComponentInfo{4, "unknown", HalAdapterComponentKind::Unknown,
                              false, 99}};
  topology.functions = {
      HalAdapterFunctionInfo{"fn", 1, "user", true, true, 2, std::int32_t{8},
                             13, true},
      HalAdapterFunctionInfo{
          "fn-no-runtime", 0, {}, false, false, 0, std::nullopt, 0, false}};
  topology.threads = {
      HalAdapterThreadInfo{"servo",
                           1000000,
                           7,
                           true,
                           true,
                           std::int32_t{9},
                           12,
                           {"fn", "fn-no-runtime"}},
      HalAdapterThreadInfo{"base", 0, 0, false, false, std::nullopt, 0, {}}};
  topology.pins = {
      HalAdapterPinInfo{"bit-in", HalAdapterValue{true}, HalAdapterType::Bit,
                        HalAdapterPinDirection::In, 1, std::string("sig")},
      HalAdapterPinInfo{
          "u64-io", HalAdapterValue{std::uint64_t{18446744073709551615ULL}},
          HalAdapterType::U64, HalAdapterPinDirection::Io, 2, std::nullopt}};
  topology.params = {
      HalAdapterParamInfo{
          "s64", HalAdapterValue{std::int64_t{-9223372036854775807LL - 1}},
          HalAdapterType::S64, HalAdapterParamDirection::ReadOnly, 3},
      HalAdapterParamInfo{"float", HalAdapterValue{2.25}, HalAdapterType::Float,
                          HalAdapterParamDirection::ReadWrite, 4}};
  topology.signals = {
      HalAdapterSignalInfo{"signal", HalAdapterValue{std::uint32_t{7}},
                           HalAdapterType::U32, std::string("driver"), 1, 2, 3},
      HalAdapterSignalInfo{"un-driven", HalAdapterValue{std::int32_t{-6}},
                           HalAdapterType::S32, std::nullopt, 0, 0, 0}};

  linuxcnc::v1::HalTopology encoded;
  encoded.add_components()->set_name("stale");
  encode_hal_topology(topology, &encoded);
  assert(encoded.components_size() == 4);
  assert(encoded.components(0).kind() == linuxcnc::v1::HAL_COMPONENT_KIND_USER);
  assert(encoded.components(1).kind() ==
         linuxcnc::v1::HAL_COMPONENT_KIND_REALTIME);
  assert(encoded.components(2).kind() ==
         linuxcnc::v1::HAL_COMPONENT_KIND_OTHER);
  assert(encoded.components(3).kind() ==
         linuxcnc::v1::HAL_COMPONENT_KIND_UNKNOWN);
  assert(encoded.components(0).pid() == 42);
  assert(encoded.functions_size() == 2);
  assert(encoded.functions(0).runtime() == 8.0);
  assert(encoded.functions(0).max_runtime_increased());
  assert(encoded.threads_size() == 2);
  assert(encoded.threads(0).period_ns() == 1000000);
  assert(encoded.threads(0).functions_size() == 2);
  assert(encoded.pins_size() == 2);
  assert(encoded.pins(0).type() == linuxcnc::v1::HAL_TYPE_BIT);
  assert(encoded.pins(0).direction() == linuxcnc::v1::HAL_PIN_DIRECTION_IN);
  assert(encoded.pins(0).signal_name() == "sig");
  assert(encoded.pins(1).value().u64() == 18446744073709551615ULL);
  assert(encoded.pins(1).direction() == linuxcnc::v1::HAL_PIN_DIRECTION_IO);
  assert(encoded.params_size() == 2);
  assert(encoded.params(0).value().s64() == -9223372036854775807LL - 1);
  assert(encoded.params(0).direction() == linuxcnc::v1::HAL_PARAM_DIRECTION_RO);
  assert(encoded.params(1).direction() == linuxcnc::v1::HAL_PARAM_DIRECTION_RW);
  assert(encoded.signals_size() == 2);
  assert(encoded.signals(0).driver() == "driver");
  assert(encoded.signals(0).readers() == 1);
  assert(encoded.signals(0).writers() == 2);
  assert(encoded.signals(0).bidirs() == 3);
  assert(encoded.signals(1).value().s32() == -6);
}

}  // namespace

int main() {
  gcode_mapping_all_variants_test();
  hal_scalar_and_reference_mapping_test();
  hal_topology_mapping_test();
  return 0;
}
