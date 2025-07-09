import {
  TaskMode,
  TaskState,
  ExecState,
  InterpState,
  TrajMode,
  MotionType,
  KinematicsType,
  ProgramUnits,
  RcsStatus,
  NmlMessageType,
  JointType,
  OrientState,
  EmcDebug,
} from "./constants";

/** Available axis identifiers in the LinuxCNC coordinate system. */
export type AvailableAxis = "X" | "Y" | "Z" | "A" | "B" | "C" | "U" | "V" | "W";

/**
 * Position and orientation in the LinuxCNC coordinate system.
 * Represents a pose with 9 degrees of freedom (3 linear + 3 rotational + 3 auxiliary).
 * All values are in machine units.
 * Axes descriptions are assumed, but they may vary by machine configuration.
 */
export interface EmcPose {
  /** X-axis position in machine units. */
  x: number;
  /** Y-axis position in machine units. */
  y: number;
  /** Z-axis position in machine units. */
  z: number;
  /** A-axis rotation around X-axis in degrees. */
  a: number;
  /** B-axis rotation around Y-axis in degrees. */
  b: number;
  /** C-axis rotation around Z-axis in degrees. */
  c: number;
  /** U-axis auxiliary linear position in machine units. */
  u: number;
  /** V-axis auxiliary linear position in machine units. */
  v: number;
  /** W-axis auxiliary linear position in machine units. */
  w: number;
}

/**
 * Tool table entry representing a cutting tool in the LinuxCNC system.
 * Each tool has physical properties, position offset, and is assigned to a specific pocket.
 */
export interface ToolEntry {
  /**
   * Tool number identifier.
   * Use 0 to indicate no tool (notool).
   */
  toolNo: number;

  /**
   * Pocket number in the tool carousel, ranging from 0 to CANON_POCKETS_MAX-1 (default LinuxCNC build: 0-1000).
   * Pocket 0 represents the spindle position.
   */
  pocketNo: number;

  /** Position offset for the tool relative to the machine coordinate system. */
  offset: EmcPose;

  /** Tool diameter in machine units. Used for cutter compensation calculations. */
  diameter: number;

  /** Front angle of the tool in degrees. Used for lathe tooling geometry. */
  frontAngle: number;

  /** Back angle of the tool in degrees. Used for lathe tooling geometry. */
  backAngle: number;

  /** Tool orientation code. Integer value defining the tool's cutting orientation. Used for lathe tooling geometry */
  orientation: number;

  /**
   * Comment for the tool.
   * In default LinuxCNC build, maximum length is 39 characters (CANON_TOOL_COMMENT_SIZE - 1 for null terminator).
   */
  comment: string;
}

/**
 * Active G-codes for each modal group in the LinuxCNC interpreter.
 * Each property represents the currently active G-code from its respective modal group.
 * Integer values reflect the nominal G-code numbers multiplied by 10.
 * (Examples: 10 = G1, 430 = G43, 923 = G92.3)
 */
export interface ActiveGCodes {
  /**
   * Modal Group 0 - Non-modal codes.
   * G4 (dwell), G10 (coordinate system), G28/G30 (reference return),
   * G52 (local coordinate system), G53 (machine coordinates),
   * G92/G92.1/G92.2/G92.3 (coordinate system offset).
   * Note: Group 0 codes are not modal and taken from the current block.
   */

  gMode0: number;
  /**
   * Modal Group 1 - Motion commands.
   * G0 (rapid), G1 (linear), G2 (CW arc), G3 (CCW arc), G33 (spindle synchronized),
   * G38.n (probe variations), G73 (drilling with chip break), G76 (threading),
   * G80 (cancel canned cycle), G81-G89 (canned cycles).
   */
  motionMode: number;

  /**
   * Modal Group 2 - Plane selection.
   * G17 (XY plane), G18 (XZ plane), G19 (YZ plane),
   * G17.1 (UV plane), G18.1 (UW plane), G19.1 (VW plane).
   */
  plane: number;

  /**
   * Modal Group 3 - Distance mode.
   * G90 (absolute distance), G91 (incremental distance).
   */
  distanceMode: number;

  /**
   * Modal Group 4 - Arc IJK distance mode.
   * G90.1 (absolute IJK), G91.1 (incremental IJK).
   */
  ijkDistanceMode: number;

  /**
   * Modal Group 5 - Feed rate mode.
   * G93 (inverse time), G94 (units per minute), G95 (units per revolution).
   */
  feedRateMode: number;

  /**
   * Modal Group 6 - Units.
   * G20 (inches), G21 (millimeters).
   */
  units: number;

  /**
   * Modal Group 7 - Cutter compensation.
   * G40 (cancel compensation), G41 (left compensation), G42 (right compensation),
   * G41.1 (dynamic left compensation), G42.1 (dynamic right compensation).
   */
  cutterComp: number;

  /**
   * Modal Group 8 - Tool length offset.
   * G43 (tool length offset), G43.1 (dynamic tool length offset), G49 (cancel tool length offset).
   */
  toolLengthOffset: number;

  /**
   * Modal Group 10 - Canned cycles return mode.
   * G98 (return to initial level), G99 (return to R level).
   */
  retractMode: number;

  /**
   * Modal Group 12 - Coordinate system selection.
   * G54-G59, G59.1-G59.3 (coordinate system origins).
   */
  origin: number;

  /**
   * Modal Group 13 - Path control mode.
   * G61 (exact path), G61.1 (exact stop), G64 (continuous path with optional tolerance).
   */
  pathControl: number;

  /**
   * Modal Group 14 - Spindle speed mode.
   * G96 (constant surface speed), G97 (constant RPM).
   */
  spindleSpeedMode: number;

  /**
   * Modal Group 15 - Lathe diameter mode.
   * G7 (lathe diameter mode), G8 (lathe radius mode).
   */
  latheDiameterMode: number;

  /**
   * G92 coordinate system offset applied state.
   * G92.2 (suspend G92 offsets), G92.3 (restore suspended G92 offsets).
   */
  g92Applied: number;
}

/**
 * Active M-codes for each modal group in the LinuxCNC interpreter.
 * Each property represents the currently active M-code from its respective modal group.
 * Integer values reflect the nominal M-code numbers.
 */
export interface ActiveMCodes {
  /**
   * Modal Group 4 - Stopping commands.
   * M0 (program pause), M1 (optional pause), M2 (program end),
   * M30 (program end with rewind), M60 (pallet change pause).
   */
  stopping: number;

  /**
   * Modal Group 6 - Tool change.
   * M6 (tool change), optionally followed by Tn (tool number).
   */
  toolChange: number;

  /**
   * Modal Group 7 - Spindle control.
   * M3 (spindle clockwise), M4 (spindle counterclockwise), M5 (spindle stop).
   */
  spindleControl: number;

  /**
   * Modal Group 8 - Coolant control (mist).
   * M7 (mist coolant on), M9 (all coolant off).
   * Note: M7 and M8 can both be active simultaneously.
   */
  mistCoolant: number;

  /**
   * Modal Group 8 - Coolant control (flood).
   * M8 (flood coolant on), M9 (all coolant off).
   * Note: M7 and M8 can both be active simultaneously.
   */
  floodCoolant: number;

  /**
   * Modal Group 9 - Override switches.
   * M48 (enable speed and feed overrides), M49 (disable speed and feed overrides).
   */
  overrideControl: number;

  /**
   * Adaptive feed control.
   * M52 (adaptive feed control).
   */
  adaptiveFeedControl: number;

  /**
   * Feed hold control.
   * M53 (feed hold control).
   */
  feedHoldControl: number;
}

/**
 * Current interpreter settings from the LinuxCNC system.
 * These values correspond to the settings tuple returned by the interpreter.
 */
export interface ActiveSettings {
  /**
   * Current feed rate setting.
   * Corresponds to settings[1] in the interpreter settings tuple.
   */
  feedRate: number;

  /**
   * Current spindle speed setting.
   * Corresponds to settings[2] in the interpreter settings tuple.
   */
  speed: number;

  /**
   * G64 P blend tolerance setting.
   * Controls path blending tolerance for continuous path mode (G64).
   * Corresponds to settings[3] in the interpreter settings tuple.
   */
  blendTolerance: number;

  /**
   * G64 Q naive CAM tolerance setting.
   * Controls naive CAM tolerance for continuous path mode (G64).
   * Corresponds to settings[4] in the interpreter settings tuple.
   */
  naiveCAMTolerance: number;
}

/**
 * Task status information from the LinuxCNC system.
 * Contains information about the current state of task execution, interpreter state, and active program.
 */
export interface TaskStat {
  /** Current task mode. One of MDI, AUTO, MANUAL. */
  mode: TaskMode;

  /** Current task state. One of ESTOP, ESTOP_RESET, ON, OFF. */
  state: TaskState;

  /** Task execution state. One of ERROR, DONE, WAITING_FOR_MOTION, etc. */
  execState: ExecState;

  /** Current state of RS274NGC interpreter. One of IDLE, READING, PAUSED, WAITING. */
  interpState: InterpState;

  /** Current subroutine depth. 0 if not in a subroutine. */
  callLevel: number;

  /** Source line number motion is currently executing. */
  motionLine: number;

  /** Currently executing line number. */
  currentLine: number;

  /** Line the RS274NGC interpreter is currently reading. */
  readLine: number;

  /** Optional stop current status flag. */
  optionalStopState: boolean;

  /** Block delete current status flag. */
  blockDeleteState: boolean;

  /** Flag indicating M66 timer is in progress. */
  inputTimeout: boolean;

  /** Currently loaded G-code filename with path. */
  file: string;

  /** Currently executing command. */
  command: string;

  /** Path to the INI file passed to LinuxCNC. */
  iniFilename: string;

  /** Offset of the currently active coordinate system (G54-G59, etc.). */
  g5xOffset: EmcPose;

  /** Currently active coordinate system index. G54=1, G55=2, etc. */
  g5xIndex: number;

  /** Pose of the current G92 offset. */
  g92Offset: EmcPose;

  /** Current XY rotation angle around Z axis in degrees. */
  rotationXY: number;

  /** Offset values of the current tool. */
  toolOffset: EmcPose;

  /** Currently active G-codes for each modal group. */
  activeGCodes: ActiveGCodes;

  /** Currently active M-codes for each modal group. */
  activeMCodes: ActiveMCodes;

  /** Current interpreter settings (feed rate, speed, tolerances). */
  activeSettings: ActiveSettings;

  /** Current program units. One of INCH, MM, CM. */
  programUnits: ProgramUnits;

  /** Current RS274NGC interpreter return code. One of INTERP_OK, INTERP_EXIT, INTERP_EXECUTE_FINISH, etc. */
  // TODO: add enum
  interpreterErrorCode: number;

  /** Task paused flag. */
  taskPaused: boolean;

  /** Remaining time on dwell (G4) command in seconds. */
  delayLeft: number;

  /** Number of queued MDI commands. */
  queuedMdiCommands: number;
}

/**
 * Joint status information for a single joint in the LinuxCNC system.
 * Each joint has various properties related to position, limits, errors, and state.
 */
export interface JointStat {
  /** Type of axis configuration. LINEAR=1, ANGULAR=2. Reflects [JOINT_n]TYPE configuration parameter. */
  jointType: JointType;

  /** Joint units per mm, or per degree for angular joints. Joint units are the same as machine units, unless set otherwise by [JOINT_n]UNITS configuration parameter. */
  units: number;

  /** Backlash in machine units. Configuration parameter, reflects [JOINT_n]BACKLASH. */
  backlash: number;

  /** Minimum limit (soft limit) for joint motion, in machine units. Configuration parameter, reflects [JOINT_n]MIN_LIMIT. */
  minPositionLimit: number;

  /** Maximum limit (soft limit) for joint motion, in machine units. Configuration parameter, reflects [JOINT_n]MAX_LIMIT. */
  maxPositionLimit: number;

  /** Minimum following error. Configuration parameter, reflects [JOINT_n]MIN_FERROR. */
  minFerror: number;

  /** Maximum following error. Configuration parameter, reflects [JOINT_n]FERROR. */
  maxFerror: number;

  /** Current following error. */
  ferrorCurrent: number;

  /** Magnitude of maximum following error encountered. */
  ferrorHighMark: number;

  /** Commanded output position. */
  output: number; // commanded position

  /** Current input position (actual position). */
  input: number; // actual position

  /** Current velocity. */
  velocity: number;

  /** True when joint is in position. */
  inPosition: boolean;

  /** True when homing is in progress. */
  homing: boolean;

  /** True when joint has been homed. */
  homed: boolean;

  /** True when axis amplifier fault is present. */
  fault: boolean;

  /** True when joint is enabled. */
  enabled: boolean;

  /** True when minimum soft limit was exceeded. */
  minSoftLimit: boolean;

  /** True when maximum soft limit was exceeded. */
  maxSoftLimit: boolean;

  /** True when minimum hard limit is exceeded. */
  minHardLimit: boolean;

  /** True when maximum hard limit is exceeded. */
  maxHardLimit: boolean;

  /** True when limits are overridden. */
  overrideLimits: boolean;
}

/**
 * Axis status information for a single axis in the LinuxCNC system.
 * Note: Many properties that were formerly in the axis dictionary are now in the joint dictionary,
 * because on nontrivial kinematics machines these items (such as backlash) are properties of joints, not axes.
 */
export interface AxisStat {
  /**
   * Minimum limit (soft limit) for axis motion, in machine units.
   * Configuration parameter, reflects [JOINT_n]MIN_LIMIT.
   */
  minPositionLimit: number;

  /**
   * Maximum limit (soft limit) for axis motion, in machine units.
   * Configuration parameter, reflects [JOINT_n]MAX_LIMIT.
   */
  maxPositionLimit: number;

  /** Current velocity of the axis. */
  velocity: number;
}

/**
 * Spindle status information for a spindle in the LinuxCNC system.
 * Contains information about spindle speed, direction, state, and control parameters.
 */
export interface SpindleStat {
  /**
   * Spindle speed value in RPM.
   * Positive values indicate clockwise rotation, negative values indicate counterclockwise.
   * With G96 active, this reflects the maximum speed set by the optional G96 D-word
   * or, if the D-word was missing, the default values +/-1e30.
   */
  speed: number;

  /** Spindle speed override scale as a floating point value. 1.0 for 100% override */
  override: number;

  /**
   * Rotational direction of the spindle.
   * - `1`: Forward (clockwise)
   * - `0`: Off (stopped)
   * - `-1`: Reverse (counterclockwise)
   */
  direction: -1 | 0 | 1;

  /** Value of the spindle brake flag. True when brake is engaged. */
  brake: boolean;

  /**
   * Spindle speed change state.
   * - `1`: Increasing
   * - `0`: None (steady)
   * - `-1`: Decreasing
   */
  increasing: -1 | 0 | 1;

  /** Value of the spindle enabled flag. True when spindle is enabled. */
  enabled: boolean;

  /** Current spindle orientation state. */
  orientState: OrientState;

  /** Fault code from motion.spindle-orient-fault. */
  orientFault: number;

  /** Value of the spindle override enabled flag. True when override is enabled. */
  spindleOverrideEnabled: boolean;

  /** Spindle homed status (not currently implemented). */
  homed: boolean;
}

/**
 * Trajectory status information from the LinuxCNC motion controller.
 * Contains information about motion planning, current position, velocity, and trajectory execution state.
 */
export interface TrajectoryStat {
  /** Machine linear units per mm. Reflects [TRAJ]LINEAR_UNITS INI value. */
  linearUnits: number;

  /** Machine angular units per degree. Reflects [TRAJ]ANGULAR_UNITS INI value. */
  angularUnits: number;

  /** Thread period in seconds. */
  cycleTime: number;

  /** Number of joints configured. Reflects [KINS]JOINTS INI value. */
  joints: number;

  /** Number of spindles configured. Reflects [TRAJ]SPINDLES INI value. */
  spindles: number;

  /** Available axes as defined by [TRAJ]COORDINATES in the INI file. */
  availableAxes: AvailableAxis[];

  /** Mode of the Motion controller. One of COORD, FREE, TELEOP. */
  mode: TrajMode;

  /** Trajectory planner enabled flag. */
  enabled: boolean;

  /** Machine-in-position flag. */
  inPosition: boolean;

  /** Current size of the trajectory planner queue. */
  queue: number;

  /** Number of motions blending. */
  activeQueue: number;

  /** Flag indicating if the trajectory planner queue is full. */
  queueFull: boolean;

  /** Currently executing motion ID. */
  id: number;

  /** Motion paused flag. */
  paused: boolean;

  /** Current feedrate override scale (1.0 = 100%). */
  feedRateOverride: number;

  /** Current rapid override scale (1.0 = 100%). */
  rapidRateOverride: number;

  /** Commanded trajectory position in machine units. */
  position: EmcPose;

  /** Current actual trajectory position in machine units. */
  actualPosition: EmcPose;

  /** Commanded system velocity for next segment in machine units per second. */
  // TODO: verify if this is always in machine units
  velocity: number;

  /** Default acceleration. Reflects [TRAJ]DEFAULT_ACCELERATION INI entry. */
  acceleration: number;

  /** Maximum velocity. Reflects [TRAJ]MAX_VELOCITY or current limit set by halui.max-velocity. */
  maxVelocity: number;

  /** Maximum acceleration. Reflects [TRAJ]MAX_ACCELERATION. */
  maxAcceleration: number;

  /** Position where probe tripped in machine units. */
  probedPosition: EmcPose;

  /** Flag indicating if probe has tripped (latch). */
  probeTripped: boolean;

  /** Flag indicating if a probe operation is in progress. */
  probing: boolean;

  /** Value of the motion.probe-input pin (typically 0 or 1). */
  probeVal: number;

  /** Type of kinematics. One of IDENTITY, FORWARD_ONLY, INVERSE_ONLY, BOTH. */
  kinematicsType: KinematicsType;

  /** Type of currently executing motion. One of TRAVERSE, FEED, ARC, etc., or NONE if no motion. */
  motionType: MotionType;

  /** Remaining distance of current move as reported by trajectory planner. */
  distanceToGo: number;

  /** Remaining distance of current move for each axis as reported by trajectory planner. */
  dtg: EmcPose;

  /** Current velocity in user units per second. */
  currentVel: number;

  /** Enable flag for feed override. */
  feedOverrideEnabled: boolean;

  /** Status of adaptive feedrate override. */
  adaptiveFeedEnabled: boolean;

  /** Enable flag for feed hold. */
  feedHoldEnabled: boolean;
}

/**
 * Tool-related I/O status information.
 * Contains information about tool changes and current tool state.
 */
export interface ToolIoStat {
  /** Pocket number that is prepared for tool change. -1 if no prepared pocket. */
  pocketPrepped: number;

  /** Current tool number loaded in spindle. 0 if no tool loaded. */
  toolInSpindle: number;

  /** Pocket number for the currently loaded tool. 0 if no tool loaded. */
  toolFromPocket: number;
  // toolTable is part of the root LinuxCNCStat for direct access
}

/**
 * Coolant system status information.
 * Contains the state of mist and flood coolant systems.
 */
export interface CoolantIoStat {
  /** Mist coolant status. True when mist is on (M7). */
  mist: boolean;

  /** Flood coolant status. True when flood is on (M8). */
  flood: boolean;
}

/**
 * Motion system status information.
 * Contains comprehensive status of trajectory planning, joints, axes, spindles, and I/O.
 */
export interface MotionStat {
  /** Trajectory planner status and motion execution information. */
  traj: TrajectoryStat;

  /** Array of joint status information. Length matches EMCMOT_MAX_JOINTS. */
  joint: JointStat[];

  /** Array of axis status information. Length matches EMCMOT_MAX_AXIS. */
  axis: AxisStat[];

  /** Array of spindle status information. Length matches EMCMOT_MAX_SPINDLES. */
  spindle: SpindleStat[];

  /** Current state of digital input pins. */
  digitalInput: number[];

  /** Current state of digital output pins. */
  digitalOutput: number[];

  /** Current values of analog input pins. */
  analogInput: number[];

  /** Current values of analog output pins. */
  analogOutput: number[];
}

/**
 * I/O system status information.
 * Contains status of tools, coolant, and emergency stop systems.
 */
export interface IoStat {
  /** Tool-related I/O status. */
  tool: ToolIoStat;

  /** Coolant system status. */
  coolant: CoolantIoStat;

  /** Emergency stop status. True when in E-stop state. */
  estop: boolean;
}

/**
 * Complete LinuxCNC system status.
 * This is the main status structure containing all subsystem states and information.
 */
export interface LinuxCNCStat {
  /** Serial number of the last completed command sent by UI to task. */
  echoSerialNumber: number;

  /** Overall status of the NML update. One of DONE, EXEC, ERROR. */
  state: RcsStatus;

  /** Task subsystem status including interpreter and program execution state. */
  task: TaskStat;

  /** Motion subsystem status including trajectory, joints, axes, and spindles. */
  motion: MotionStat;

  /** I/O subsystem status including tools, coolant, and emergency stop. */
  io: IoStat;

  /** Top-level debug flags from the INI file. */
  debug: number;

  /** Complete tool table with all tool entries and their properties. */
  toolTable: ToolEntry[];
}

/**
 * LinuxCNC error message structure.
 * Contains error information from the LinuxCNC system.
 */
export interface LinuxCNCError {
  /** Type of NML message that generated this error. */
  type: NmlMessageType;

  /** Human-readable error message text. */
  message: string;
}

export type DebugFlags = EmcDebug;

// utility type to generate string paths for nested objects
type NestedPaths<T, K extends keyof T = keyof T> = K extends string
  ? T[K] extends object
    ? T[K] extends readonly (infer U)[]
      ? U extends object
        ? `${K}` | `${K}.${number}` | `${K}.${number}.${NestedPaths<U>}`
        : `${K}` | `${K}.${number}`
      : `${K}` | `${K}.${NestedPaths<T[K]>}`
    : `${K}`
  : never;

// Type-safe property paths for LinuxCNCStat (dot-separated string paths)
export type LinuxCNCStatPaths = NestedPaths<LinuxCNCStat>;

// Utility type to get the type of a property from a dot-separated path
type GetPropertyType<T, P extends string> = P extends keyof T
  ? T[P]
  : P extends `${infer K}.${infer R}`
  ? K extends keyof T
    ? T[K] extends readonly (infer U)[]
      ? R extends `${number}`
        ? U
        : R extends `${number}.${infer Rest}`
        ? GetPropertyType<U, Rest>
        : never
      : GetPropertyType<T[K], R>
    : never
  : never;

// Utility type for recursively making all properties optional
export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object
    ? RecursivePartial<T[P]>
    : T[P];
};

// Callback types
export type StatPropertyWatchCallback<P extends LinuxCNCStatPaths> = (
  newValue: GetPropertyType<LinuxCNCStat, P>,
  oldValue: GetPropertyType<LinuxCNCStat, P> | null,
  propertyPath: P
) => void;
export type FullStatChangeCallback = (
  newStat: LinuxCNCStat,
  oldStat: LinuxCNCStat | null
) => void;
export type ErrorCallback = (error: LinuxCNCError) => void;
