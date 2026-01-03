/**
 * G-Code Parser Types
 *
 * Defines all TypeScript interfaces for G-code operations parsed by the
 * LinuxCNC rs274ngc interpreter.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Types of operations that can be parsed from G-code.
 */
export enum OperationType {
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
}

/**
 * Plane selection for arc and NURBS operations.
 */
export enum Plane {
  XY = 1,
  YZ = 2,
  XZ = 3,
  UV = 4,
  VW = 5,
  UW = 6,
}

/**
 * Length units used in the G-code program.
 */
export enum Units {
  INCHES = 1,
  MM = 2,
  CM = 3,
}

// ============================================================================
// Basic Types
// ============================================================================

/**
 * 9-axis position representing a complete machine pose.
 * Stored as Float64Array for performance (avoids V8 hidden class transitions).
 *
 * Index mapping:
 * - [0] = x: X-axis position
 * - [1] = y: Y-axis position
 * - [2] = z: Z-axis position
 * - [3] = a: A-axis rotation (around X) in degrees
 * - [4] = b: B-axis rotation (around Y) in degrees
 * - [5] = c: C-axis rotation (around Z) in degrees
 * - [6] = u: U-axis auxiliary linear position
 * - [7] = v: V-axis auxiliary linear position
 * - [8] = w: W-axis auxiliary linear position
 */
export type Position = Float64Array;

/** Position array indices for readable access */
export const enum PositionIndex {
  X = 0,
  Y = 1,
  Z = 2,
  A = 3,
  B = 4,
  C = 5,
  U = 6,
  V = 7,
  W = 8,
}

/**
 * Complete tool data including geometry and offsets.
 */
export interface ToolData {
  /** Tool number identifier */
  toolNumber: number;
  /** Pocket number in the tool carousel */
  pocketNumber: number;
  /** Tool diameter in current length units */
  diameter: number;
  /** Front angle in degrees (for lathe tools) */
  frontAngle: number;
  /** Back angle in degrees (for lathe tools) */
  backAngle: number;
  /** Tool orientation code (0-9 for lathe tools) */
  orientation: number;
  /** Tool length offset */
  offset: Position;
}

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
  /** Target tap position as Float64Array(3): [x, y, z] */
  pos: Float64Array;
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
  units: Units;
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
  /** Complete data for the new tool */
  tool: ToolData;
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
  /** Minimum coordinates encountered as Float64Array(3): [x, y, z] */
  min: Float64Array;
  /** Maximum coordinates encountered as Float64Array(3): [x, y, z] */
  max: Float64Array;
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

/**
 * Progress information reported during parsing.
 */
export interface ParseProgress {
  /** Number of bytes read from the file */
  bytesRead: number;
  /** Total file size in bytes */
  totalBytes: number;
  /** Percentage complete (0-100) */
  percent: number;
  /** Number of operations parsed so far */
  operationCount: number;
}

/**
 * Options for parsing a G-code file.
 */
export interface ParseOptions {
  /** Path to LinuxCNC INI file (required) */
  iniPath: string;
  /** Progress callback, called periodically during parsing */
  onProgress?: (progress: ParseProgress) => void;
  /**
   * Target number of progress updates during parsing.
   * The actual interval is calculated based on file size to achieve
   * approximately this many updates. Default is 40.
   * Set to 0 to disable progress callbacks entirely.
   * @default 40
   */
  progressUpdates?: number;
}
