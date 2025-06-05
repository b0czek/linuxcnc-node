import { NapiOptions } from "./native_type_interfaces";

// Dynamically require the native addon
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const addon: NapiOptions = require("../build/Release/nml_addon.node");

export enum TaskMode {
  MDI = addon.TASK_MODE_MDI,
  MANUAL = addon.TASK_MODE_MANUAL,
  AUTO = addon.TASK_MODE_AUTO,
}

export enum TaskState {
  ESTOP = addon.TASK_STATE_ESTOP,
  ESTOP_RESET = addon.TASK_STATE_ESTOP_RESET,
  OFF = addon.TASK_STATE_OFF,
  ON = addon.TASK_STATE_ON,
}

export enum ExecState {
  ERROR = addon.EXEC_STATE_ERROR,
  DONE = addon.EXEC_STATE_DONE,
  WAITING_FOR_MOTION = addon.EXEC_STATE_WAITING_FOR_MOTION,
  WAITING_FOR_MOTION_QUEUE = addon.EXEC_STATE_WAITING_FOR_MOTION_QUEUE,
  WAITING_FOR_IO = addon.EXEC_STATE_WAITING_FOR_IO,
  WAITING_FOR_MOTION_AND_IO = addon.EXEC_STATE_WAITING_FOR_MOTION_AND_IO,
  WAITING_FOR_DELAY = addon.EXEC_STATE_WAITING_FOR_DELAY,
  WAITING_FOR_SYSTEM_CMD = addon.EXEC_STATE_WAITING_FOR_SYSTEM_CMD,
  WAITING_FOR_SPINDLE_ORIENTED = addon.EXEC_STATE_WAITING_FOR_SPINDLE_ORIENTED,
}

export enum InterpState {
  IDLE = addon.INTERP_STATE_IDLE,
  READING = addon.INTERP_STATE_READING,
  PAUSED = addon.INTERP_STATE_PAUSED,
  WAITING = addon.INTERP_STATE_WAITING,
}

export enum TrajMode {
  FREE = addon.TRAJ_MODE_FREE,
  COORD = addon.TRAJ_MODE_COORD,
  TELEOP = addon.TRAJ_MODE_TELEOP,
}

export enum MotionType {
  NONE = addon.MOTION_TYPE_NONE,
  TRAVERSE = addon.EMC_MOTION_TYPE_TRAVERSE,
  FEED = addon.EMC_MOTION_TYPE_FEED,
  ARC = addon.EMC_MOTION_TYPE_ARC,
  TOOLCHANGE = addon.EMC_MOTION_TYPE_TOOLCHANGE,
  PROBING = addon.EMC_MOTION_TYPE_PROBING,
  INDEXROTARY = addon.EMC_MOTION_TYPE_INDEXROTARY,
}

export enum KinematicsType {
  IDENTITY = addon.KINEMATICS_IDENTITY,
  FORWARD_ONLY = addon.KINEMATICS_FORWARD_ONLY,
  INVERSE_ONLY = addon.KINEMATICS_INVERSE_ONLY,
  BOTH = addon.KINEMATICS_BOTH,
}

export enum RcsStatus {
  UNINITIALIZED = addon.RCS_STATUS_UNINITIALIZED,
  DONE = addon.RCS_STATUS_DONE,
  EXEC = addon.RCS_STATUS_EXEC,
  ERROR = addon.RCS_STATUS_ERROR,
}

export enum ProgramUnits {
  INCH = 1, // CANON_UNITS_INCHES
  MM = 2, // CANON_UNITS_MM
  CM = 3, // CANON_UNITS_CM
}

export enum SpindleDirection {
  FORWARD = addon.SPINDLE_FORWARD,
  REVERSE = addon.SPINDLE_REVERSE,
  OFF = addon.SPINDLE_OFF,
  INCREASE = addon.SPINDLE_INCREASE,
  DECREASE = addon.SPINDLE_DECREASE,
  CONSTANT = addon.SPINDLE_CONSTANT,
}

export enum CoolantMode {
  MIST_ON = addon.MIST_ON,
  MIST_OFF = addon.MIST_OFF,
  FLOOD_ON = addon.FLOOD_ON,
  FLOOD_OFF = addon.FLOOD_OFF,
}

export enum BrakeState {
  ENGAGE = addon.BRAKE_ENGAGE,
  RELEASE = addon.BRAKE_RELEASE,
}

export enum JogMode {
  STOP = addon.JOG_STOP,
  CONTINUOUS = addon.JOG_CONTINUOUS,
  INCREMENT = addon.JOG_INCREMENT,
}

export enum AutoOpType {
  RUN = addon.AUTO_RUN,
  PAUSE = addon.AUTO_PAUSE,
  RESUME = addon.AUTO_RESUME,
  STEP = addon.AUTO_STEP,
  REVERSE = addon.AUTO_REVERSE,
  FORWARD = addon.AUTO_FORWARD,
}

export enum NmlMessageType {
  EMC_OPERATOR_ERROR = addon.EMC_OPERATOR_ERROR_TYPE,
  EMC_OPERATOR_TEXT = addon.EMC_OPERATOR_TEXT_TYPE,
  EMC_OPERATOR_DISPLAY = addon.EMC_OPERATOR_DISPLAY_TYPE,
  NML_ERROR = addon.NML_ERROR_TYPE,
  NML_TEXT = addon.NML_TEXT_TYPE,
  NML_DISPLAY = addon.NML_DISPLAY_TYPE,
}

export enum JointType {
  LINEAR = addon.JOINT_TYPE_LINEAR,
  ANGULAR = addon.JOINT_TYPE_ANGULAR,
}
