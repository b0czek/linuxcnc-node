/**
 * G-Code Parser Types
 *
 * Defines all TypeScript interfaces for G-code operations parsed by the
 * LinuxCNC rs274ngc interpreter.
 */

import type { OperationType, Plane, ProgramUnits } from "./constants";
import type { Position, Position3 } from "./core";

export { OperationType, Plane } from "./constants";

// ============================================================================
// Motion Operations
// ============================================================================

/**
 * G0 rapid traverse motion.
 */
export interface TraverseOperation {
  type: OperationType.TRAVERSE;
  /** Source G-code line number */
  lineNumber: number;
  /** Target position */
  pos: Position;
}

/**
 * G1 linear feed motion.
 */
export interface FeedOperation {
  type: OperationType.FEED;
  /** Source G-code line number */
  lineNumber: number;
  /** Target position */
  pos: Position;
}

/**
 * G2/G3 arc motion.
 * Arc data is provided for reconstruction without tessellation.
 */
export interface ArcOperation {
  type: OperationType.ARC;
  /** Source G-code line number */
  lineNumber: number;
  /** Target position */
  pos: Position;
  /** Plane in which the arc lies */
  plane: Plane;
  /** Arc geometry data for reconstruction */
  arcData: {
    /** Center coordinate on the first axis of the plane (e.g., X for XY plane) */
    centerFirst: number;
    /** Center coordinate on the second axis of the plane (e.g., Y for XY plane) */
    centerSecond: number;
    /**
     * Rotation direction and count.
     * Positive = CCW (G3), Negative = CW (G2).
     * Magnitude > 1 indicates multiple full turns.
     */
    rotation: number;
    /** End point on the axis perpendicular to the plane (helix axis) */
    axisEndPoint: number;
  };
}

/**
 * G38.x probe motion.
 */
export interface ProbeOperation {
  type: OperationType.PROBE;
  /** Source G-code line number */
  lineNumber: number;
  /** Target probe position */
  pos: Position;
}

/**
 * G33.1 rigid tapping motion.
 */
export interface RigidTapOperation {
  type: OperationType.RIGID_TAP;
  /** Source G-code line number */
  lineNumber: number;
  /** Target tap position as Position3: [x, y, z] */
  pos: Position3;
  /** Tap scale factor */
  scale: number;
}

/**
 * G4 dwell (pause) operation.
 */
export interface DwellOperation {
  type: OperationType.DWELL;
  /** Position where dwell occurs */
  pos: Position;
  /** Dwell duration in seconds */
  duration: number;
  /** Current plane at time of dwell */
  plane: Plane;
}

/**
 * G5 NURBS (non-rational B-spline) feed motion.
 */
export interface NurbsG5Operation {
  type: OperationType.NURBS_G5;
  /** Source G-code line number */
  lineNumber: number;
  /** Target position */
  pos: Position;
  /** Plane in which the NURBS curve lies */
  plane: Plane;
  /** NURBS curve data */
  nurbsData: {
    /** B-spline order */
    order: number;
    /** Control points with weights */
    controlPoints: Array<{
      x: number;
      y: number;
      weight: number;
    }>;
  };
}

/**
 * G6 NURBS (rational B-spline with knots) feed motion.
 */
export interface NurbsG6Operation {
  type: OperationType.NURBS_G6;
  /** Source G-code line number */
  lineNumber: number;
  /** Target position */
  pos: Position;
  /** Plane in which the NURBS curve lies */
  plane: Plane;
  /** NURBS curve data */
  nurbsData: {
    /** B-spline order */
    order: number;
    /** Control points with R and K values */
    controlPoints: Array<{
      x: number;
      y: number;
      /** R value from G-code */
      r: number;
      /** Knot parameter */
      k: number;
    }>;
  };
}

// ============================================================================
// State Change Operations
// ============================================================================

/**
 * G20/G21 units change operation.
 */
export interface UnitsChangeOperation {
  type: OperationType.UNITS_CHANGE;
  /** New active units */
  units: ProgramUnits;
}

/**
 * G17/G18/G19 plane change operation.
 */
export interface PlaneChangeOperation {
  type: OperationType.PLANE_CHANGE;
  /** New active plane */
  plane: Plane;
}

/**
 * G54-G59.3 coordinate system offset change.
 */
export interface G5xOffsetOperation {
  type: OperationType.G5X_OFFSET;
  /** Coordinate system origin index (1=G54, 2=G55, ..., 9=G59.3) */
  origin: number;
  /** Offset values */
  offset: Position;
}

/**
 * G92 coordinate offset change.
 */
export interface G92OffsetOperation {
  type: OperationType.G92_OFFSET;
  /** Offset values */
  offset: Position;
}

/**
 * XY plane rotation change (from G10 L2 R...).
 */
export interface XYRotationOperation {
  type: OperationType.XY_ROTATION;
  /** Rotation angle in degrees */
  rotation: number;
}

/**
 * G43/G49 tool length offset change.
 */
export interface ToolOffsetOperation {
  type: OperationType.TOOL_OFFSET;
  /** Tool offset values */
  offset: Position;
}

/**
 * M6 tool change operation with complete tool data.
 */
export interface ToolChangeOperation {
  type: OperationType.TOOL_CHANGE;
  /** Tool number to change to */
  toolNumber: number;
}

/**
 * Feed rate change (F word).
 */
export interface FeedRateChangeOperation {
  type: OperationType.FEED_RATE_CHANGE;
  /** New feed rate in current units per minute */
  feedRate: number;
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * Union of all possible G-code operations.
 */
export type GCodeOperation =
  | TraverseOperation
  | FeedOperation
  | ArcOperation
  | ProbeOperation
  | RigidTapOperation
  | DwellOperation
  | NurbsG5Operation
  | NurbsG6Operation
  | UnitsChangeOperation
  | PlaneChangeOperation
  | G5xOffsetOperation
  | G92OffsetOperation
  | XYRotationOperation
  | ToolOffsetOperation
  | ToolChangeOperation
  | FeedRateChangeOperation;

// ============================================================================
// Result Types
// ============================================================================

/**
 * Bounding box extents of the parsed G-code program.
 * Min/max stored as Float64Array(3): [x, y, z]
 */
export interface Extents {
  /** Minimum coordinates encountered as Position3: [x, y, z] */
  min: Position3;
  /** Maximum coordinates encountered as Position3: [x, y, z] */
  max: Position3;
}

/**
 * Complete result from parsing a G-code file.
 */
export interface GCodeParseResult {
  /** Sequential list of operations in execution order */
  operations: GCodeOperation[];
  /** Bounding box of all motion operations */
  extents: Extents;
}
