/**
 * Core LinuxCNC Constants and Enums
 * 
 * These enums represent various states and types in the LinuxCNC system.
 * Values are defined here as they should match the C++ constants from LinuxCNC.
 */

export enum TaskMode {
  MDI = 1,
  MANUAL = 2,
  AUTO = 3,
}

export enum TaskState {
  ESTOP = 1,
  ESTOP_RESET = 2,
  OFF = 3,
  ON = 4,
}

export enum ExecState {
  ERROR = 1,
  DONE = 2,
  WAITING_FOR_MOTION = 3,
  WAITING_FOR_MOTION_QUEUE = 4,
  WAITING_FOR_IO = 5,
  WAITING_FOR_MOTION_AND_IO = 6,
  WAITING_FOR_DELAY = 7,
  WAITING_FOR_SYSTEM_CMD = 8,
  WAITING_FOR_SPINDLE_ORIENTED = 9,
}

export enum InterpState {
  IDLE = 1,
  READING = 2,
  PAUSED = 3,
  WAITING = 4,
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

export enum RcsStatus {
  UNINITIALIZED = 0,
  DONE = 1,
  EXEC = 2,
  ERROR = 3,
}

export enum ProgramUnits {
  INCH = 1,
  MM = 2,
  CM = 3,
}

export enum NmlMessageType {
  EMC_OPERATOR_ERROR = 1,
  EMC_OPERATOR_TEXT = 2,
  EMC_OPERATOR_DISPLAY = 3,
  NML_ERROR = 4,
  NML_TEXT = 5,
  NML_DISPLAY = 6,
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
  CONFIG = 0x00000001,
  VERSIONS = 0x00000002,
  TASK_ISSUE = 0x00000004,
  NML = 0x00000008,
  MOTION_TIME = 0x00000010,
  INTERP = 0x00000020,
  RCS = 0x00000040,
  INTERP_LIST = 0x00000080,
  IOCONTROL = 0x00000100,
  OWORD = 0x00000200,
  REMAP = 0x00000400,
  PYTHON = 0x00000800,
  NAMEDPARAM = 0x00001000,
  GDBONSIGNAL = 0x00002000,
  STATE_TAGS = 0x00004000,
}
