/** Generated from the proto/linuxcnc/v1 schema set. Do not edit manually. */

export enum TaskMode {
  MANUAL = 1,
  AUTO = 2,
  MDI = 3,
}

export enum TaskState {
  ESTOP = 1,
  ESTOP_RESET = 2,
  OFF = 3,
  ON = 4,
}

export enum RcsStatus {
  UNINITIALIZED = -1,
  DONE = 1,
  EXEC = 2,
  ERROR = 3,
}

export enum ExecState {
  ERROR = 1,
  DONE = 2,
  WAITING_FOR_MOTION = 3,
  WAITING_FOR_MOTION_QUEUE = 4,
  WAITING_FOR_IO = 5,
  WAITING_FOR_MOTION_AND_IO = 7,
  WAITING_FOR_DELAY = 8,
  WAITING_FOR_SYSTEM_CMD = 9,
  WAITING_FOR_SPINDLE_ORIENTED = 10,
}

export enum InterpState {
  IDLE = 1,
  READING = 2,
  PAUSED = 3,
  WAITING = 4,
}

export enum StopState {
  IDLE = 0,
  STOPPING = 1,
  STOPPED = 2,
  STARTING = 3,
}

export enum TrajMode {
  FREE = 1,
  COORD = 2,
  TELEOP = 3,
}

export enum MotionType {
  NONE = 0,
  TRAVERSE = 1,
  FEED = 2,
  ARC = 3,
  TOOLCHANGE = 4,
  PROBING = 5,
  INDEXROTARY = 6,
}

export enum KinematicsType {
  IDENTITY = 1,
  FORWARD_ONLY = 2,
  INVERSE_ONLY = 3,
  BOTH = 4,
}

export enum ProgramUnits {
  INCH = 1,
  MM = 2,
  CM = 3,
}

export enum NmlMessageType {
  NML_ERROR = 1,
  NML_TEXT = 2,
  NML_DISPLAY = 3,
  EMC_OPERATOR_ERROR = 11,
  EMC_OPERATOR_TEXT = 12,
  EMC_OPERATOR_DISPLAY = 13,
}

export enum JointType {
  LINEAR = 1,
  ANGULAR = 2,
}

export enum OrientState {
  NONE = 0,
  COMPLETE = 1,
  IN_PROGRESS = 2,
  FAULTED = 3,
}

export enum EmcDebug {
  CONFIG = 2,
  VERSIONS = 8,
  TASK_ISSUE = 16,
  NML = 64,
  MOTION_TIME = 128,
  INTERP = 256,
  RCS = 512,
  INTERP_LIST = 2048,
  IOCONTROL = 4096,
  OWORD = 8192,
  REMAP = 16384,
  PYTHON = 32768,
  NAMEDPARAM = 65536,
  GDBONSIGNAL = 131072,
  STATE_TAGS = 524288,
}

export enum OperationType {
  TRAVERSE = 1,
  FEED = 2,
  ARC = 3,
  PROBE = 4,
  RIGID_TAP = 5,
  DWELL = 6,
  NURBS_G5 = 7,
  NURBS_G6 = 8,
  UNITS_CHANGE = 10,
  PLANE_CHANGE = 11,
  G5X_OFFSET = 12,
  G92_OFFSET = 13,
  XY_ROTATION = 14,
  TOOL_OFFSET = 15,
  TOOL_CHANGE = 16,
  FEED_RATE_CHANGE = 17,
}

export enum Plane {
  XY = 1,
  YZ = 2,
  XZ = 3,
  UV = 4,
  VW = 5,
  UW = 6,
}

export const POSITION_STRIDE = 10;

export enum PositionLoggerIndex {
  X = 0,
  Y = 1,
  Z = 2,
  A = 3,
  B = 4,
  C = 5,
  U = 6,
  V = 7,
  W = 8,
  MotionType = 9,
}

export enum PositionIndex {
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
