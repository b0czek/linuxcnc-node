/**
 * Canon Preview - Implementation
 *
 * Implements LinuxCNC canonical machining functions for G-code preview/parsing.
 * These functions are called by the rs274ngc interpreter during execution.
 */

#include "canon_preview.hh"

// Public LinuxCNC headers only
#include "canon.hh"
#include "emcpos.h"
#include "emctool.h"
#include "tooldata.hh"

#include <cstring>
#include <cmath>

// Disable _task for preview mode
int _task = 0;

// Parameter file name storage
char _parameter_file_name[PARAMETER_FILE_NAME_LENGTH];

// Tool offset storage
EmcPose tool_offset;

// Thread-local parse context
static thread_local GCodeParser::ParseContext *g_parseContext = nullptr;

namespace GCodeParser
{

  void ParseContext::addOperation(Operation &&op)
  {
    operations.push_back(std::move(op));
  }

  void ParseContext::updateExtents(const Position &pos)
  {
    extents.update(pos);
  }

  void ParseContext::reportProgress(size_t bytesRead)
  {
    if (progressCallback && totalBytes > 0)
    {
      ParseProgress progress;
      progress.bytesRead = bytesRead;
      progress.totalBytes = totalBytes;
      progress.percent = (static_cast<double>(bytesRead) / totalBytes) * 100.0;
      progress.operationCount = operations.size();
      progressCallback(progress);
    }
  }

  void setParseContext(ParseContext *ctx)
  {
    g_parseContext = ctx;
  }

  ParseContext *getParseContext()
  {
    return g_parseContext;
  }

  void clearParseContext()
  {
    g_parseContext = nullptr;
  }

} // namespace GCodeParser

// Helper macro to get context safely
#define GET_CTX()                           \
  auto *ctx = GCodeParser::getParseContext(); \
  if (!ctx)                                 \
    return;

#define GET_CTX_RET(ret)                    \
  auto *ctx = GCodeParser::getParseContext(); \
  if (!ctx)                                 \
    return ret;

// ============================================================================
// Motion Functions
// ============================================================================

void STRAIGHT_TRAVERSE(int lineno,
                       double x, double y, double z,
                       double a, double b, double c,
                       double u, double v, double w)
{
  GET_CTX();

  if (!ctx->metric)
  {
    x *= 25.4;
    y *= 25.4;
    z *= 25.4;
    u *= 25.4;
    v *= 25.4;
    w *= 25.4;
  }
  GCodeParser::TraverseOp op;
  op.lineNumber = lineno;
  op.pos = {x, y, z, a, b, c, u, v, w};

  ctx->currentPosition = op.pos;
  ctx->updateExtents(op.pos);
  ctx->addOperation(std::move(op));
}

void STRAIGHT_FEED(int lineno,
                   double x, double y, double z,
                   double a, double b, double c,
                   double u, double v, double w)
{
  GET_CTX();

  if (!ctx->metric)
  {
    x *= 25.4;
    y *= 25.4;
    z *= 25.4;
    u *= 25.4;
    v *= 25.4;
    w *= 25.4;
  }
  GCodeParser::FeedOp op;
  op.lineNumber = lineno;
  op.pos = {x, y, z, a, b, c, u, v, w};

  ctx->currentPosition = op.pos;
  ctx->updateExtents(op.pos);
  ctx->addOperation(std::move(op));
}

void ARC_FEED(int lineno,
              double first_end, double second_end,
              double first_axis, double second_axis,
              int rotation, double axis_end_point,
              double a, double b, double c,
              double u, double v, double w)
{
  GET_CTX();

  if (!ctx->metric)
  {
    first_end *= 25.4;
    second_end *= 25.4;
    first_axis *= 25.4;
    second_axis *= 25.4;
    axis_end_point *= 25.4;
    u *= 25.4;
    v *= 25.4;
    w *= 25.4;
  }
  GCodeParser::ArcOp op;
  op.lineNumber = lineno;
  op.plane = ctx->currentPlane;

  // Set end position based on plane
  op.pos = ctx->currentPosition;
  switch (ctx->currentPlane)
  {
  case GCodeParser::Plane::XY:
    op.pos.x = first_end;
    op.pos.y = second_end;
    op.pos.z = axis_end_point;
    break;
  case GCodeParser::Plane::YZ:
    op.pos.y = first_end;
    op.pos.z = second_end;
    op.pos.x = axis_end_point;
    break;
  case GCodeParser::Plane::XZ:
    op.pos.z = first_end;
    op.pos.x = second_end;
    op.pos.y = axis_end_point;
    break;
  default:
    op.pos.x = first_end;
    op.pos.y = second_end;
    op.pos.z = axis_end_point;
    break;
  }
  op.pos.a = a;
  op.pos.b = b;
  op.pos.c = c;
  op.pos.u = u;
  op.pos.v = v;
  op.pos.w = w;

  // Arc data
  op.arcData.centerFirst = first_axis;
  op.arcData.centerSecond = second_axis;
  op.arcData.rotation = rotation;
  op.arcData.axisEndPoint = axis_end_point;

  ctx->currentPosition = op.pos;
  ctx->updateExtents(op.pos); // We only update extents with end pos for now, start is implicit
  ctx->addOperation(std::move(op));
}

void STRAIGHT_PROBE(int lineno,
                    double x, double y, double z,
                    double a, double b, double c,
                    double u, double v, double w,
                    unsigned char /*probe_type*/)
{
  GET_CTX();

  if (!ctx->metric)
  {
    x *= 25.4;
    y *= 25.4;
    z *= 25.4;
    u *= 25.4;
    v *= 25.4;
    w *= 25.4;
  }
  GCodeParser::ProbeOp op;
  op.lineNumber = lineno;
  op.pos = {x, y, z, a, b, c, u, v, w};

  ctx->currentPosition = op.pos;
  ctx->updateExtents(op.pos);
  ctx->addOperation(std::move(op));
}

void RIGID_TAP(int lineno, double x, double y, double z, double scale)
{
  GET_CTX();

  if (!ctx->metric)
  {
    x *= 25.4;
    y *= 25.4;
    z *= 25.4;
  }
  GCodeParser::RigidTapOp op;
  op.lineNumber = lineno;
  op.pos = {x, y, z};
  op.scale = scale;

  // Update position (rigid tap returns to start Z)
  ctx->currentPosition.x = x;
  ctx->currentPosition.y = y;
  // Z returns to original after tap
  ctx->updateExtents({x, y, z, 0, 0, 0, 0, 0, 0});
  ctx->addOperation(std::move(op));
}

void DWELL(double seconds)
{
  GET_CTX();

  GCodeParser::DwellOp op;
  op.pos = ctx->currentPosition;
  op.duration = seconds;
  op.plane = ctx->currentPlane;

  ctx->addOperation(std::move(op));
}

// ============================================================================
// NURBS Functions
// ============================================================================

void NURBS_G5_FEED(int lineno,
                   const std::vector<NURBS_CONTROL_POINT> &nurbs_control_points,
                   unsigned int nurbs_order,
                   CANON_PLANE plane)
{
  GET_CTX();

  GCodeParser::NurbsG5Op op;
  op.lineNumber = lineno;

  
  // Convert plane
  switch (plane)
  {
  case CANON_PLANE::XY:
    op.plane = GCodeParser::Plane::XY;
    break;
  case CANON_PLANE::YZ:
    op.plane = GCodeParser::Plane::YZ;
    break;
  case CANON_PLANE::XZ:
    op.plane = GCodeParser::Plane::XZ;
    break;
  default:
    op.plane = GCodeParser::Plane::XY;
    break;
  }

  op.nurbsData.order = nurbs_order;
  for (const auto &cp : nurbs_control_points)
  {
    GCodeParser::NurbsG5ControlPoint point;
    point.x = !ctx->metric ? cp.NURBS_X * 25.4 : cp.NURBS_X;
    point.y = !ctx->metric ? cp.NURBS_Y * 25.4 : cp.NURBS_Y;
    point.weight = cp.NURBS_W;
    op.nurbsData.controlPoints.push_back(point);
  }

  // End position is last control point
  if (!nurbs_control_points.empty())
  {
    const auto &last = nurbs_control_points.back();
    double ex = !ctx->metric ? last.NURBS_X * 25.4 : last.NURBS_X;
    double ey = !ctx->metric ? last.NURBS_Y * 25.4 : last.NURBS_Y;

    switch (op.plane)
    {
    case GCodeParser::Plane::XY:
      op.pos = ctx->currentPosition;
      op.pos.x = ex;
      op.pos.y = ey;
      break;
    case GCodeParser::Plane::YZ:
      op.pos = ctx->currentPosition;
      op.pos.y = ex;
      op.pos.z = ey;
      break;
    case GCodeParser::Plane::XZ:
      op.pos = ctx->currentPosition;
      op.pos.x = ey;
      op.pos.z = ex;
      break;
    default:
      op.pos = ctx->currentPosition;
      op.pos.x = ex;
      op.pos.y = ey;
      break;
    }
    ctx->currentPosition = op.pos;
    ctx->updateExtents(op.pos);
  }

  ctx->addOperation(std::move(op));
}

void NURBS_G6_FEED(int lineno,
                   const std::vector<NURBS_G6_CONTROL_POINT> &nurbs_control_points,
                   unsigned int k,
                   double /*feedrate*/,
                   int /*L_option*/,
                   CANON_PLANE plane)
{
  GET_CTX();

  GCodeParser::NurbsG6Op op;
  op.lineNumber = lineno;
  
  switch (plane)
  {
  case CANON_PLANE::XY:
    op.plane = GCodeParser::Plane::XY;
    break;
  case CANON_PLANE::YZ:
    op.plane = GCodeParser::Plane::YZ;
    break;
  case CANON_PLANE::XZ:
    op.plane = GCodeParser::Plane::XZ;
    break;
  default:
    op.plane = GCodeParser::Plane::XY;
    break;
  }

  op.nurbsData.order = k;
  for (const auto &cp : nurbs_control_points)
  {
    GCodeParser::NurbsG6ControlPoint point;
    point.x = !ctx->metric ? cp.NURBS_X * 25.4 : cp.NURBS_X;
    point.y = !ctx->metric ? cp.NURBS_Y * 25.4 : cp.NURBS_Y;
    point.r = cp.NURBS_R;
    point.k = cp.NURBS_K;
    op.nurbsData.controlPoints.push_back(point);
  }

  // End position
  if (nurbs_control_points.size() > k)
  {
    size_t lastIdx = nurbs_control_points.size() - 1;
    const auto &last = nurbs_control_points[lastIdx];
    double ex = !ctx->metric ? last.NURBS_X * 25.4 : last.NURBS_X;
    double ey = !ctx->metric ? last.NURBS_Y * 25.4 : last.NURBS_Y;

    op.pos = ctx->currentPosition;
    switch (op.plane)
    {
    case GCodeParser::Plane::XY:
      op.pos.x = ex;
      op.pos.y = ey;
      break;
    case GCodeParser::Plane::YZ:
      op.pos.y = ex;
      op.pos.z = ey;
      break;
    case GCodeParser::Plane::XZ:
      op.pos.x = ey;
      op.pos.z = ex;
      break;
    default:
      op.pos.x = ex;
      op.pos.y = ey;
      break;
    }
    ctx->currentPosition = op.pos;
    ctx->updateExtents(op.pos);
  }

  ctx->addOperation(std::move(op));
}

// ============================================================================
// State Change Functions
// ============================================================================

void USE_LENGTH_UNITS(CANON_UNITS u)
{
  GET_CTX();

  GCodeParser::Units newUnits;
  switch (u)
  {
  case CANON_UNITS_INCHES:
    newUnits = GCodeParser::Units::INCHES;
    ctx->metric = false;
    break;
  case CANON_UNITS_MM:
    newUnits = GCodeParser::Units::MM;
    ctx->metric = true;
    break;
  case CANON_UNITS_CM:
    newUnits = GCodeParser::Units::CM;
    ctx->metric = true;
    break;
  default:
    newUnits = GCodeParser::Units::MM;
    ctx->metric = true;
    break;
  }

  if (newUnits != ctx->currentUnits)
  {
    ctx->currentUnits = newUnits;
    GCodeParser::UnitsChangeOp op;
    op.units = newUnits;
    ctx->addOperation(std::move(op));
  }
}

void SELECT_PLANE(CANON_PLANE pl)
{
  GET_CTX();

  GCodeParser::Plane newPlane;
  switch (pl)
  {
  case CANON_PLANE::XY:
    newPlane = GCodeParser::Plane::XY;
    break;
  case CANON_PLANE::YZ:
    newPlane = GCodeParser::Plane::YZ;
    break;
  case CANON_PLANE::XZ:
    newPlane = GCodeParser::Plane::XZ;
    break;
  case CANON_PLANE::UV:
    newPlane = GCodeParser::Plane::UV;
    break;
  case CANON_PLANE::VW:
    newPlane = GCodeParser::Plane::VW;
    break;
  case CANON_PLANE::UW:
    newPlane = GCodeParser::Plane::UW;
    break;
  default:
    newPlane = GCodeParser::Plane::XY;
    break;
  }

  if (newPlane != ctx->currentPlane)
  {
    ctx->currentPlane = newPlane;
    GCodeParser::PlaneChangeOp op;
    op.plane = newPlane;
    ctx->addOperation(std::move(op));
  }
}

void SET_G5X_OFFSET(int g5x_index,
                    double x, double y, double z,
                    double a, double b, double c,
                    double u, double v, double w)
{
  GET_CTX();



  if (!ctx->metric)
  {
    x *= 25.4;
    y *= 25.4;
    z *= 25.4;
    u *= 25.4;
    v *= 25.4;
    w *= 25.4;
  }
  GCodeParser::G5xOffsetOp op;
  op.origin = g5x_index;
  op.offset = {x, y, z, a, b, c, u, v, w};
  ctx->addOperation(std::move(op));
}

void SET_G92_OFFSET(double x, double y, double z,
                    double a, double b, double c,
                    double u, double v, double w)
{
  GET_CTX();



  if (!ctx->metric)
  {
    x *= 25.4;
    y *= 25.4;
    z *= 25.4;
    u *= 25.4;
    v *= 25.4;
    w *= 25.4;
  }
  GCodeParser::G92OffsetOp op;
  op.offset = {x, y, z, a, b, c, u, v, w};
  ctx->addOperation(std::move(op));
}

void SET_XY_ROTATION(double t)
{
  GET_CTX();

  GCodeParser::XYRotationOp op;
  op.rotation = t;
  ctx->addOperation(std::move(op));
}

void SET_FEED_RATE(double rate)
{
  GET_CTX();



  if (rate != ctx->lastFeedRate)
  {
    if (!ctx->metric)
    {
      rate *= 25.4;
    }
    ctx->currentFeedRate = rate;
    ctx->lastFeedRate = rate;

    GCodeParser::FeedRateChangeOp op;
    op.feedRate = rate;
    ctx->addOperation(std::move(op));
  }
  else
  {
    ctx->currentFeedRate = rate;
  }
}

void USE_TOOL_LENGTH_OFFSET(const EmcPose &offset)
{
  GET_CTX();

  tool_offset = offset;

  GCodeParser::ToolOffsetOp op;
  if (!ctx->metric)
  {
    op.offset.x = offset.tran.x * 25.4;
    op.offset.y = offset.tran.y * 25.4;
    op.offset.z = offset.tran.z * 25.4;
    op.offset.u = offset.u * 25.4;
    op.offset.v = offset.v * 25.4;
    op.offset.w = offset.w * 25.4;
  }
  else
  {
    op.offset.x = offset.tran.x;
    op.offset.y = offset.tran.y;
    op.offset.z = offset.tran.z;
    op.offset.u = offset.u;
    op.offset.v = offset.v;
    op.offset.w = offset.w;
  }
  op.offset.a = offset.a;
  op.offset.b = offset.b;
  op.offset.c = offset.c;

  ctx->addOperation(std::move(op));
}

// ============================================================================
// Tool Functions
// ============================================================================

static int g_selectedTool = 0;

void SELECT_TOOL(int tool)
{
  g_selectedTool = tool;
}

void CHANGE_TOOL()
{
  GET_CTX();

  ctx->selectedTool = g_selectedTool;

  // Get tool data from tool table
  CANON_TOOL_TABLE toolTable = GET_EXTERNAL_TOOL_TABLE(g_selectedTool);

  GCodeParser::ToolChangeOp op;
  op.toolNumber = toolTable.toolno;

  ctx->addOperation(std::move(op));
}

void CHANGE_TOOL_NUMBER(int /*pocket*/) {}
void RELOAD_TOOLDATA(void) {}
void SET_TOOL_TABLE_ENTRY(int, int, const EmcPose &, double, double, double, int) {}

// ============================================================================
// Comment Function
// ============================================================================

void COMMENT(const char *comment)
{
}

void MESSAGE(char *s)
{
  COMMENT(s);
}

// ============================================================================
// Stub/No-op Functions (required by interpreter but not needed for preview)
// ============================================================================

void INIT_CANON() {}
void SET_TRAVERSE_RATE(double) {}
void SET_FEED_MODE(int, int) {}
void SET_FEED_REFERENCE(double) {}
void SET_FEED_REFERENCE(CANON_FEED_REFERENCE) {}
void SET_CUTTER_RADIUS_COMPENSATION(double) {}
void START_CUTTER_RADIUS_COMPENSATION(int) {}
void STOP_CUTTER_RADIUS_COMPENSATION(int) {}
void STOP_CUTTER_RADIUS_COMPENSATION() {}
void START_SPEED_FEED_SYNCH() {}
void START_SPEED_FEED_SYNCH(int, double, bool) {}
void STOP_SPEED_FEED_SYNCH() {}
void START_SPINDLE_COUNTERCLOCKWISE(int, int) {}
void START_SPINDLE_CLOCKWISE(int, int) {}
void SET_SPINDLE_MODE(int, double) {}
void STOP_SPINDLE_TURNING(int) {}
void SET_SPINDLE_SPEED(int, double) {}
void ORIENT_SPINDLE(int, double, int) {}
void WAIT_SPINDLE_ORIENT_COMPLETE(int, double) {}
void SPINDLE_RETRACT() {}
void SPINDLE_RETRACT_TRAVERSE() {}
void USE_NO_SPINDLE_FORCE() {}
void PROGRAM_STOP() {}
void PROGRAM_END() {}
void FINISH() {}
void ON_RESET() {}
void PALLET_SHUTTLE() {}
void UPDATE_TAG(const StateTag &) {}
void OPTIONAL_PROGRAM_STOP() {}
void SET_MOTION_CONTROL_MODE(CANON_MOTION_MODE, double) {}
void SET_MOTION_CONTROL_MODE(double) {}
void SET_MOTION_CONTROL_MODE(CANON_MOTION_MODE) {}
void SET_NAIVECAM_TOLERANCE(double) {}
void CANON_ERROR(const char *, ...) {}
void CLAMP_AXIS(CANON_AXIS) {}
void UNCLAMP_AXIS(CANON_AXIS) {}
void DISABLE_ADAPTIVE_FEED() {}
void ENABLE_ADAPTIVE_FEED() {}
void DISABLE_FEED_OVERRIDE() {}
void ENABLE_FEED_OVERRIDE() {}
void DISABLE_SPEED_OVERRIDE(int) {}
void ENABLE_SPEED_OVERRIDE(int) {}
void DISABLE_FEED_HOLD() {}
void ENABLE_FEED_HOLD() {}
void FLOOD_OFF() {}
void FLOOD_ON() {}
void MIST_OFF() {}
void MIST_ON() {}
void CLEAR_AUX_OUTPUT_BIT(int) {}
void SET_AUX_OUTPUT_BIT(int) {}
void SET_AUX_OUTPUT_VALUE(int, double) {}
void CLEAR_MOTION_OUTPUT_BIT(int) {}
void SET_MOTION_OUTPUT_BIT(int) {}
void SET_MOTION_OUTPUT_VALUE(int, double) {}
void TURN_PROBE_ON() {}
void TURN_PROBE_OFF() {}
int UNLOCK_ROTARY(int, int) { return 0; }
int LOCK_ROTARY(int, int) { return 0; }
void INTERP_ABORT(int, const char *) {}
void SET_BLOCK_DELETE(bool) {}
void SET_OPTIONAL_PROGRAM_STOP(bool) {}
void LOG(char *) {}
void LOGOPEN(char *) {}
void LOGAPPEND(char *) {}
void LOGCLOSE() {}
int USER_DEFINED_FUNCTION_ADD(USER_DEFINED_FUNCTION_TYPE, int) { return 0; }

// ============================================================================
// External Getter Functions (return defaults for preview mode)
// ============================================================================

bool GET_BLOCK_DELETE(void) { return false; }
bool GET_OPTIONAL_PROGRAM_STOP() { return false; }
int GET_EXTERNAL_TC_FAULT() { return 0; }
int GET_EXTERNAL_TC_REASON() { return 0; }

double GET_EXTERNAL_MOTION_CONTROL_TOLERANCE() { return 0.1; }
double GET_EXTERNAL_MOTION_CONTROL_NAIVECAM_TOLERANCE() { return 0.1; }

double GET_EXTERNAL_PROBE_POSITION_X()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.x : 0.0;
}
double GET_EXTERNAL_PROBE_POSITION_Y()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.y : 0.0;
}
double GET_EXTERNAL_PROBE_POSITION_Z()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.z : 0.0;
}
double GET_EXTERNAL_PROBE_POSITION_A()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.a : 0.0;
}
double GET_EXTERNAL_PROBE_POSITION_B()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.b : 0.0;
}
double GET_EXTERNAL_PROBE_POSITION_C()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.c : 0.0;
}
double GET_EXTERNAL_PROBE_POSITION_U()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.u : 0.0;
}
double GET_EXTERNAL_PROBE_POSITION_V()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.v : 0.0;
}
double GET_EXTERNAL_PROBE_POSITION_W()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.w : 0.0;
}

double GET_EXTERNAL_PROBE_VALUE() { return 0.0; }
int GET_EXTERNAL_PROBE_TRIPPED_VALUE() { return 0; }

double GET_EXTERNAL_POSITION_X()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.x : 0.0;
}
double GET_EXTERNAL_POSITION_Y()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.y : 0.0;
}
double GET_EXTERNAL_POSITION_Z()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.z : 0.0;
}
double GET_EXTERNAL_POSITION_A()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.a : 0.0;
}
double GET_EXTERNAL_POSITION_B()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.b : 0.0;
}
double GET_EXTERNAL_POSITION_C()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.c : 0.0;
}
double GET_EXTERNAL_POSITION_U()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.u : 0.0;
}
double GET_EXTERNAL_POSITION_V()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.v : 0.0;
}
double GET_EXTERNAL_POSITION_W()
{
  auto *ctx = GCodeParser::getParseContext();
  return ctx ? ctx->currentPosition.w : 0.0;
}

CANON_UNITS GET_EXTERNAL_LENGTH_UNIT_TYPE() { return CANON_UNITS_INCHES; }

CANON_TOOL_TABLE GET_EXTERNAL_TOOL_TABLE(int pocket)
{
  CANON_TOOL_TABLE tdata = {-1, -1, {{0, 0, 0}, 0, 0, 0, 0, 0, 0}, 0, 0, 0, 0, {}};
  // Try to get real tool data if tool table is available
  // For now return default
  tdata.toolno = pocket;
  return tdata;
}

int GET_EXTERNAL_DIGITAL_INPUT(int, int def) { return def; }
double GET_EXTERNAL_ANALOG_INPUT(int, double def) { return def; }
int WAIT(int, int, int, double) { return 0; }

int GET_EXTERNAL_QUEUE_EMPTY() { return 1; }
CANON_DIRECTION GET_EXTERNAL_SPINDLE(int) { return CANON_STOPPED; }
int GET_EXTERNAL_TOOL_SLOT() { return 0; }
int GET_EXTERNAL_SELECTED_TOOL_SLOT() { return 0; }
double GET_EXTERNAL_FEED_RATE() { return 1; }
double GET_EXTERNAL_TRAVERSE_RATE() { return 0; }
int GET_EXTERNAL_FLOOD() { return 0; }
int GET_EXTERNAL_MIST() { return 0; }
CANON_PLANE GET_EXTERNAL_PLANE() { return CANON_PLANE::XY; }
double GET_EXTERNAL_SPEED(int) { return 0; }
CANON_MOTION_MODE GET_EXTERNAL_MOTION_CONTROL_MODE() { return CANON_CONTINUOUS; }

int GET_EXTERNAL_FEED_OVERRIDE_ENABLE() { return 1; }
int GET_EXTERNAL_SPINDLE_OVERRIDE_ENABLE(int) { return 1; }
int GET_EXTERNAL_ADAPTIVE_FEED_ENABLE() { return 0; }
int GET_EXTERNAL_FEED_HOLD_ENABLE() { return 1; }

int GET_EXTERNAL_OFFSET_APPLIED() { return 0; }
EmcPose GET_EXTERNAL_OFFSETS()
{
  EmcPose e = {};
  return e;
}

int GET_EXTERNAL_AXIS_MASK() { return 7; } // XYZ

double GET_EXTERNAL_TOOL_LENGTH_XOFFSET() { return tool_offset.tran.x; }
double GET_EXTERNAL_TOOL_LENGTH_YOFFSET() { return tool_offset.tran.y; }
double GET_EXTERNAL_TOOL_LENGTH_ZOFFSET() { return tool_offset.tran.z; }
double GET_EXTERNAL_TOOL_LENGTH_AOFFSET() { return tool_offset.a; }
double GET_EXTERNAL_TOOL_LENGTH_BOFFSET() { return tool_offset.b; }
double GET_EXTERNAL_TOOL_LENGTH_COFFSET() { return tool_offset.c; }
double GET_EXTERNAL_TOOL_LENGTH_UOFFSET() { return tool_offset.u; }
double GET_EXTERNAL_TOOL_LENGTH_VOFFSET() { return tool_offset.v; }
double GET_EXTERNAL_TOOL_LENGTH_WOFFSET() { return tool_offset.w; }

double GET_EXTERNAL_ANGLE_UNITS() { return 1.0; }
double GET_EXTERNAL_LENGTH_UNITS() { return 0.03937007874016; } // 1/25.4

void GET_EXTERNAL_PARAMETER_FILE_NAME(char *name, int max_size)
{
  if (name && max_size > 0)
  {
    strncpy(name, _parameter_file_name, max_size - 1);
    name[max_size - 1] = '\0';
  }
}

void SET_PARAMETER_FILE_NAME(const char *name)
{
  if (name)
  {
    strncpy(_parameter_file_name, name, PARAMETER_FILE_NAME_LENGTH - 1);
    _parameter_file_name[PARAMETER_FILE_NAME_LENGTH - 1] = '\0';
  }
}

// User defined functions
USER_DEFINED_FUNCTION_TYPE USER_DEFINED_FUNCTION[USER_DEFINED_FUNCTION_NUM] = {};
