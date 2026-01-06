import { NapiOptions } from "./native_type_interfaces";

// Native addon - loaded immediately on module import
function loadAddon(): NapiOptions {
  const paths = [
    "../build/Release/nml_addon.node",
    "../../build/Release/nml_addon.node", // Fallback for debug builds
  ];

  for (const path of paths) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(path);
    } catch {
      // Try next path
    }
  }

  throw new Error(
    "Failed to load linuxcnc-node nml native addon. Please ensure it's built correctly and that LinuxCNC is in your PATH."
  );
}

export const addon: NapiOptions = loadAddon();

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
  UNINITIALIZED = -1,
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
  EMC_OPERATOR_ERROR = 11,
  EMC_OPERATOR_TEXT = 12,
  EMC_OPERATOR_DISPLAY = 13,
  NML_ERROR = 1,
  NML_TEXT = 2,
  NML_DISPLAY = 3,
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
  CONFIG = 0x00000002,
  VERSIONS = 0x00000008,
  TASK_ISSUE = 0x00000010,
  NML = 0x00000040,
  MOTION_TIME = 0x00000080,
  INTERP = 0x00000100,
  RCS = 0x00000200,
  INTERP_LIST = 0x00000800,
  IOCONTROL = 0x00001000,
  OWORD = 0x00002000,
  REMAP = 0x00004000,
  PYTHON = 0x00008000,
  NAMEDPARAM = 0x00010000,
  GDBONSIGNAL = 0x00020000,
  STATE_TAGS = 0x00080000,
}
