/**
 * C++ Operation Types for G-code Parser
 *
 * These structures mirror the TypeScript interfaces and are used to
 * store parsed operations before converting to JavaScript objects.
 */

#ifndef GCODE_OPERATION_TYPES_HH
#define GCODE_OPERATION_TYPES_HH

#include <string>
#include <variant>
#include <vector>

namespace GCodeParser
{

  // ============================================================================
  // Enums (matching TypeScript)
  // ============================================================================

  enum class OperationType
  {
    // Motion operations
    TRAVERSE = 1,
    FEED = 2,
    ARC = 3,
    PROBE = 4,
    RIGID_TAP = 5,
    DWELL = 6,
    NURBS_G5 = 7,
    NURBS_G6 = 8,

    // State change operations
    UNITS_CHANGE = 10,
    PLANE_CHANGE = 11,
    G5X_OFFSET = 12,
    G92_OFFSET = 13,
    XY_ROTATION = 14,
    TOOL_OFFSET = 15,
    TOOL_CHANGE = 16,
    FEED_RATE_CHANGE = 17,
  };

  enum class Plane
  {
    XY = 1,
    YZ = 2,
    XZ = 3,
    UV = 4,
    VW = 5,
    UW = 6,
  };

  enum class Units
  {
    INCHES = 1,
    MM = 2,
    CM = 3,
  };

  // ============================================================================
  // Basic Types
  // ============================================================================

  struct Position
  {
    double x = 0.0;
    double y = 0.0;
    double z = 0.0;
    double a = 0.0;
    double b = 0.0;
    double c = 0.0;
    double u = 0.0;
    double v = 0.0;
    double w = 0.0;
  };

  struct Position3
  {
    double x = 0.0;
    double y = 0.0;
    double z = 0.0;
  };

  struct ToolData
  {
    int toolNumber = 0;
    int pocketNumber = 0;
    double diameter = 0.0;
    double frontAngle = 0.0;
    double backAngle = 0.0;
    int orientation = 0;
    Position offset;
  };

  struct Extents
  {
    Position3 min = {1e99, 1e99, 1e99};
    Position3 max = {-1e99, -1e99, -1e99};

    void update(double x, double y, double z)
    {
      if (x < min.x)
        min.x = x;
      if (y < min.y)
        min.y = y;
      if (z < min.z)
        min.z = z;
      if (x > max.x)
        max.x = x;
      if (y > max.y)
        max.y = y;
      if (z > max.z)
        max.z = z;
    }

    void update(const Position &pos)
    {
      update(pos.x, pos.y, pos.z);
    }

    bool isValid() const
    {
      return min.x <= max.x && min.y <= max.y && min.z <= max.z;
    }

    void reset()
    {
      min = {1e99, 1e99, 1e99};
      max = {-1e99, -1e99, -1e99};
    }
  };

  struct ParseProgress
  {
    size_t bytesRead = 0;
    size_t totalBytes = 0;
    double percent = 0.0;
    size_t operationCount = 0;
  };

  // ============================================================================
  // Arc Data
  // ============================================================================

  struct ArcData
  {
    double centerFirst = 0.0;
    double centerSecond = 0.0;
    int rotation = 0;
    double axisEndPoint = 0.0;
  };

  // ============================================================================
  // NURBS Data
  // ============================================================================

  struct NurbsG5ControlPoint
  {
    double x = 0.0;
    double y = 0.0;
    double weight = 1.0;
  };

  struct NurbsG5Data
  {
    unsigned int order = 0;
    std::vector<NurbsG5ControlPoint> controlPoints;
  };

  struct NurbsG6ControlPoint
  {
    double x = 0.0;
    double y = 0.0;
    double r = 0.0;
    double k = 0.0;
  };

  struct NurbsG6Data
  {
    unsigned int order = 0;
    std::vector<NurbsG6ControlPoint> controlPoints;
  };

  // ============================================================================
  // Operation Structures
  // ============================================================================

  struct TraverseOp
  {
    static constexpr OperationType type = OperationType::TRAVERSE;
    int lineNumber = 0;
    Position pos;
  };

  struct FeedOp
  {
    static constexpr OperationType type = OperationType::FEED;
    int lineNumber = 0;
    Position pos;
  };

  struct ArcOp
  {
    static constexpr OperationType type = OperationType::ARC;
    int lineNumber = 0;
    Position pos;
    Plane plane = Plane::XY;
    ArcData arcData;
  };

  struct ProbeOp
  {
    static constexpr OperationType type = OperationType::PROBE;
    int lineNumber = 0;
    Position pos;
  };

  struct RigidTapOp
  {
    static constexpr OperationType type = OperationType::RIGID_TAP;
    int lineNumber = 0;
    Position3 pos;
    double scale = 0.0;
  };

  struct DwellOp
  {
    static constexpr OperationType type = OperationType::DWELL;
    Position pos;
    double duration = 0.0;
    Plane plane = Plane::XY;
  };

  struct NurbsG5Op
  {
    static constexpr OperationType type = OperationType::NURBS_G5;
    int lineNumber = 0;
    Position pos;
    Plane plane = Plane::XY;
    NurbsG5Data nurbsData;
  };

  struct NurbsG6Op
  {
    static constexpr OperationType type = OperationType::NURBS_G6;
    int lineNumber = 0;
    Position pos;
    Plane plane = Plane::XY;
    NurbsG6Data nurbsData;
  };

  struct UnitsChangeOp
  {
    static constexpr OperationType type = OperationType::UNITS_CHANGE;
    Units units = Units::MM;
  };

  struct PlaneChangeOp
  {
    static constexpr OperationType type = OperationType::PLANE_CHANGE;
    Plane plane = Plane::XY;
  };

  struct G5xOffsetOp
  {
    static constexpr OperationType type = OperationType::G5X_OFFSET;
    int origin = 1;
    Position offset;
  };

  struct G92OffsetOp
  {
    static constexpr OperationType type = OperationType::G92_OFFSET;
    Position offset;
  };

  struct XYRotationOp
  {
    static constexpr OperationType type = OperationType::XY_ROTATION;
    double rotation = 0.0;
  };

  struct ToolOffsetOp
  {
    static constexpr OperationType type = OperationType::TOOL_OFFSET;
    Position offset;
  };

  struct ToolChangeOp
  {
    static constexpr OperationType type = OperationType::TOOL_CHANGE;
    ToolData tool;
  };

  struct FeedRateChangeOp
  {
    static constexpr OperationType type = OperationType::FEED_RATE_CHANGE;
    double feedRate = 0.0;
  };



  // ============================================================================
  // Operation Variant
  // ============================================================================

  using Operation = std::variant<
      TraverseOp,
      FeedOp,
      ArcOp,
      ProbeOp,
      RigidTapOp,
      DwellOp,
      NurbsG5Op,
      NurbsG6Op,
      UnitsChangeOp,
      PlaneChangeOp,
      G5xOffsetOp,
      G92OffsetOp,
      XYRotationOp,
      ToolOffsetOp,
      ToolChangeOp,
      FeedRateChangeOp>;

  // Helper to get OperationType from variant
  inline OperationType getOperationType(const Operation &op)
  {
    return std::visit([](const auto &o) -> OperationType
                      { return std::remove_reference_t<decltype(o)>::type; }, op);
  }

  // ============================================================================
  // Parse Result
  // ============================================================================

  struct ParseResult
  {
    std::vector<Operation> operations;
    Extents extents;
  };

} // namespace GCodeParser

#endif // GCODE_OPERATION_TYPES_HH
