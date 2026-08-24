#include "linuxcnc_grpc/gcode_canon_preview.hpp"

#include "recordingcanon.hh"

#include <algorithm>
#include <cmath>
#include <utility>

namespace linuxcnc::server::gcode {
namespace {

namespace canon = ::linuxcnc::recording;
constexpr double pi = 3.14159265358979323846;

double positive_angle(double angle) {
  const double turn = 2.0 * pi;
  angle = std::fmod(angle, turn);
  return angle < 0.0 ? angle + turn : angle;
}

bool angle_is_on_arc(double angle, double start_angle, double sweep,
                     bool clockwise) {
  constexpr double epsilon = 1e-12;
  const double distance = clockwise
                              ? positive_angle(start_angle - angle)
                              : positive_angle(angle - start_angle);
  return distance <= sweep + epsilon;
}

Plane preview_plane(CANON_PLANE plane) {
  switch (plane) {
    case CANON_PLANE::XY: return Plane::XY;
    case CANON_PLANE::YZ: return Plane::YZ;
    case CANON_PLANE::XZ: return Plane::XZ;
    case CANON_PLANE::UV: return Plane::UV;
    case CANON_PLANE::VW: return Plane::VW;
    case CANON_PLANE::UW: return Plane::UW;
  }
  return Plane::XY;
}

double linear_value(const ParseContext& context, double value) {
  return value * context.linearUnitScale;
}

Position preview_position(const ParseContext& context, const EmcPose& pose) {
  return {linear_value(context, pose.tran.x),
          linear_value(context, pose.tran.y),
          linear_value(context, pose.tran.z),
          pose.a, pose.b, pose.c,
          linear_value(context, pose.u),
          linear_value(context, pose.v),
          linear_value(context, pose.w)};
}

void set_plane_end(Plane plane, double first, double second,
                   Position* position) {
  switch (plane) {
    case Plane::XY: position->x = first; position->y = second; break;
    case Plane::YZ: position->y = first; position->z = second; break;
    case Plane::XZ: position->z = first; position->x = second; break;
    case Plane::UV: position->u = first; position->v = second; break;
    case Plane::VW: position->v = first; position->w = second; break;
    case Plane::UW: position->u = first; position->w = second; break;
  }
}

void update_arc_extents(ParseContext& context, const Position& start,
                        const ArcOp& operation) {
  double start_first;
  double start_second;
  switch (operation.plane) {
    case Plane::XY: start_first = start.x; start_second = start.y; break;
    case Plane::YZ: start_first = start.y; start_second = start.z; break;
    case Plane::XZ: start_first = start.z; start_second = start.x; break;
    default:
      context.updateExtents(start);
      context.updateExtents(operation.pos);
      return;
  }
  const double first_offset = start_first - operation.arcData.centerFirst;
  const double second_offset = start_second - operation.arcData.centerSecond;
  const double radius = std::hypot(first_offset, second_offset);
  if (!std::isfinite(radius) || radius <= 0.0) {
    context.updateExtents(start);
    context.updateExtents(operation.pos);
    return;
  }
  double end_first;
  double end_second;
  switch (operation.plane) {
    case Plane::XY: end_first = operation.pos.x; end_second = operation.pos.y; break;
    case Plane::YZ: end_first = operation.pos.y; end_second = operation.pos.z; break;
    case Plane::XZ: end_first = operation.pos.z; end_second = operation.pos.x; break;
    default: return;
  }
  const double start_angle = std::atan2(second_offset, first_offset);
  const double end_angle = std::atan2(
      end_second - operation.arcData.centerSecond,
      end_first - operation.arcData.centerFirst);
  const bool clockwise = operation.arcData.rotation < 0;
  double sweep = clockwise ? positive_angle(start_angle - end_angle)
                           : positive_angle(end_angle - start_angle);
  const int turn_count = std::abs(operation.arcData.rotation);
  if (sweep == 0.0 && turn_count >= 1)
    sweep = 2.0 * pi;
  else if (turn_count >= 1)
    sweep += (turn_count - 1) * 2.0 * pi;
  else if (sweep == 0.0)
    sweep = 2.0 * pi;

  context.updateExtents(start);
  context.updateExtents(operation.pos);
  constexpr double cardinals[] = {0.0, pi / 2.0, pi, 3.0 * pi / 2.0};
  for (const double angle : cardinals) {
    if (!angle_is_on_arc(angle, start_angle, sweep, clockwise)) continue;
    Position point = start;
    set_plane_end(operation.plane,
                  operation.arcData.centerFirst + radius * std::cos(angle),
                  operation.arcData.centerSecond + radius * std::sin(angle),
                  &point);
    context.updateExtents(point);
  }
}

void consume(ParseContext& context, const canon::StraightTraverse& event) {
  TraverseOp operation;
  operation.lineNumber = event.line_number;
  operation.pos = preview_position(context, event.end);
  context.currentPosition = operation.pos;
  context.updateExtents(operation.pos);
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::StraightFeed& event) {
  FeedOp operation;
  operation.lineNumber = event.line_number;
  operation.pos = preview_position(context, event.end);
  context.currentPosition = operation.pos;
  context.updateExtents(operation.pos);
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::ArcFeed& event) {
  ArcOp operation;
  operation.lineNumber = event.line_number;
  operation.plane = preview_plane(event.plane);
  operation.pos = context.currentPosition;
  const double first_end = linear_value(context, event.first_end);
  const double second_end = linear_value(context, event.second_end);
  const double axis_end = linear_value(context, event.axis_end_point);
  switch (operation.plane) {
    case Plane::XY:
      operation.pos.x = first_end; operation.pos.y = second_end;
      operation.pos.z = axis_end; break;
    case Plane::YZ:
      operation.pos.y = first_end; operation.pos.z = second_end;
      operation.pos.x = axis_end; break;
    case Plane::XZ:
      operation.pos.z = first_end; operation.pos.x = second_end;
      operation.pos.y = axis_end; break;
    default:
      set_plane_end(operation.plane, first_end, second_end, &operation.pos);
      break;
  }
  operation.pos.a = event.a;
  operation.pos.b = event.b;
  operation.pos.c = event.c;
  operation.pos.u = linear_value(context, event.u);
  operation.pos.v = linear_value(context, event.v);
  operation.pos.w = linear_value(context, event.w);
  operation.arcData.centerFirst = linear_value(context, event.first_axis);
  operation.arcData.centerSecond = linear_value(context, event.second_axis);
  operation.arcData.rotation = event.rotation;
  operation.arcData.axisEndPoint = axis_end;
  update_arc_extents(context, context.currentPosition, operation);
  context.currentPosition = operation.pos;
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::StraightProbe& event) {
  ProbeOp operation;
  operation.lineNumber = event.line_number;
  operation.pos = preview_position(context, event.end);
  context.currentPosition = operation.pos;
  context.updateExtents(operation.pos);
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::RigidTap& event) {
  RigidTapOp operation;
  operation.lineNumber = event.line_number;
  operation.pos = {linear_value(context, event.x),
                   linear_value(context, event.y),
                   linear_value(context, event.z)};
  operation.scale = event.scale;
  context.currentPosition.x = operation.pos.x;
  context.currentPosition.y = operation.pos.y;
  context.extents.update(operation.pos.x, operation.pos.y, operation.pos.z);
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::Dwell& event) {
  DwellOp operation;
  operation.pos = context.currentPosition;
  operation.duration = event.seconds;
  operation.plane = context.currentPlane;
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::NurbsG5Feed& event) {
  NurbsG5Op operation;
  operation.lineNumber = event.line_number;
  operation.plane = preview_plane(event.plane);
  operation.nurbsData.order = event.order;
  operation.nurbsData.controlPoints.reserve(event.control_points.size());
  for (const auto& source : event.control_points)
    operation.nurbsData.controlPoints.push_back({
        linear_value(context, source.NURBS_X),
        linear_value(context, source.NURBS_Y), source.NURBS_W});
  operation.pos = context.currentPosition;
  if (!operation.nurbsData.controlPoints.empty()) {
    const auto& last = operation.nurbsData.controlPoints.back();
    set_plane_end(operation.plane, last.x, last.y, &operation.pos);
    context.currentPosition = operation.pos;
    context.updateExtents(operation.pos);
  }
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::NurbsG6Feed& event) {
  NurbsG6Op operation;
  operation.lineNumber = event.line_number;
  operation.plane = preview_plane(event.plane);
  operation.nurbsData.order = event.order;
  operation.nurbsData.controlPoints.reserve(event.control_points.size());
  for (const auto& source : event.control_points)
    operation.nurbsData.controlPoints.push_back({
        linear_value(context, source.NURBS_X),
        linear_value(context, source.NURBS_Y), source.NURBS_R, source.NURBS_K});
  operation.pos = context.currentPosition;
  if (operation.nurbsData.controlPoints.size() > event.order) {
    const auto& last = operation.nurbsData.controlPoints.back();
    set_plane_end(operation.plane, last.x, last.y, &operation.pos);
    context.currentPosition = operation.pos;
    context.updateExtents(operation.pos);
  }
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::LengthUnits& event) {
  Units next_units = Units::MM;
  switch (event.units) {
    case CANON_UNITS_INCHES:
      next_units = Units::INCHES; context.linearUnitScale = 25.4; break;
    case CANON_UNITS_MM:
      next_units = Units::MM; context.linearUnitScale = 1.0; break;
    case CANON_UNITS_CM:
      next_units = Units::CM; context.linearUnitScale = 10.0; break;
  }
  if (next_units == context.currentUnits) return;
  context.currentUnits = next_units;
  UnitsChangeOp operation;
  operation.units = next_units;
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::Plane& event) {
  const Plane next_plane = preview_plane(event.plane);
  if (next_plane == context.currentPlane) return;
  context.currentPlane = next_plane;
  PlaneChangeOp operation;
  operation.plane = next_plane;
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::G5xOffset& event) {
  G5xOffsetOp operation;
  operation.origin = event.index;
  operation.offset = preview_position(context, event.offset);
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::G92Offset& event) {
  G92OffsetOp operation;
  operation.offset = preview_position(context, event.offset);
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::XyRotation& event) {
  XYRotationOp operation;
  operation.rotation = event.degrees;
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::FeedRate& event) {
  const double rate = linear_value(context, event.rate);
  context.currentFeedRate = rate;
  if (rate == context.lastFeedRate) return;
  context.lastFeedRate = rate;
  FeedRateChangeOp operation;
  operation.feedRate = rate;
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::ToolOffset& event) {
  ToolOffsetOp operation;
  operation.offset = preview_position(context, event.offset);
  context.addOperation(std::move(operation));
}

void consume(ParseContext& context, const canon::ToolChange& event) {
  context.selectedTool = event.tool_number;
  ToolChangeOp operation;
  operation.toolNumber = event.tool_number;
  context.addOperation(std::move(operation));
}

}  // namespace

void ParseContext::addOperation(Operation&& operation) {
  if (cancelled) return;
  operations.push_back(std::move(operation));
  ++operationCount;
}

bool ParseContext::flushReadyBatch() {
  if (!batchCallback || batchSize == 0 || operations.size() < batchSize)
    return !cancelled;
  return flushBatch();
}

bool ParseContext::flushBatch() {
  if (!batchCallback || operations.empty()) return !cancelled;
  const std::size_t max_batch = batchSize == 0 ? operations.size() : batchSize;
  while (!operations.empty() && !cancelled) {
    const std::size_t count = std::min(max_batch, operations.size());
    OperationBatch batch;
    batch.reserve(count);
    for (std::size_t index = 0; index < count; ++index)
      batch.push_back(std::move(operations[index]));
    operations.erase(operations.begin(), operations.begin() + count);
    if (!batchCallback(std::move(batch))) cancelled = true;
  }
  return !cancelled;
}

bool ParseContext::cancellationRequested() {
  if (cancelled) return true;
  if (cancellationCallback && cancellationCallback()) cancelled = true;
  return cancelled;
}

void ParseContext::updateExtents(const Position& position) {
  extents.update(position);
}

void ParseContext::reportProgress(std::size_t bytes_read) {
  if (!progressCallback || totalBytes == 0) return;
  ParseProgress progress;
  progress.bytesRead = bytes_read;
  progress.totalBytes = totalBytes;
  progress.percent = (static_cast<double>(bytes_read) / totalBytes) * 100.0;
  progress.operationCount = operationCount;
  progressCallback(progress);
}

void consumeRecordingEvents(::linuxcnc::recording::Session& session,
                            ParseContext& context) {
  for (const auto& event : session.take_events())
    std::visit([&context](const auto& value) { consume(context, value); }, event);
}

}  // namespace linuxcnc::server::gcode
