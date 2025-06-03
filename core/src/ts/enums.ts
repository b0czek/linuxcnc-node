// src/ts/enums.ts

// Constants from nml_addon.cc (which should mirror emc.hh and local #defines)
import { Constants } from "./constants";

export enum TaskMode {
  MDI = Constants.TASK_MODE_MDI,
  MANUAL = Constants.TASK_MODE_MANUAL,
  AUTO = Constants.TASK_MODE_AUTO,
}

export enum TaskState {
  ESTOP = Constants.TASK_STATE_ESTOP,
  ESTOP_RESET = Constants.TASK_STATE_ESTOP_RESET,
  OFF = Constants.TASK_STATE_OFF,
  ON = Constants.TASK_STATE_ON,
}

export enum ExecState {
  ERROR = Constants.EXEC_STATE_ERROR,
  DONE = Constants.EXEC_STATE_DONE,
  WAITING_FOR_MOTION = Constants.EXEC_STATE_WAITING_FOR_MOTION,
  WAITING_FOR_MOTION_QUEUE = Constants.EXEC_STATE_WAITING_FOR_MOTION_QUEUE,
  WAITING_FOR_IO = Constants.EXEC_STATE_WAITING_FOR_IO,
  WAITING_FOR_MOTION_AND_IO = Constants.EXEC_STATE_WAITING_FOR_MOTION_AND_IO,
  WAITING_FOR_DELAY = Constants.EXEC_STATE_WAITING_FOR_DELAY,
  WAITING_FOR_SYSTEM_CMD = Constants.EXEC_STATE_WAITING_FOR_SYSTEM_CMD,
  WAITING_FOR_SPINDLE_ORIENTED = Constants.EXEC_STATE_WAITING_FOR_SPINDLE_ORIENTED,
}

export enum InterpState {
  IDLE = Constants.INTERP_STATE_IDLE,
  READING = Constants.INTERP_STATE_READING,
  PAUSED = Constants.INTERP_STATE_PAUSED,
  WAITING = Constants.INTERP_STATE_WAITING,
}

export enum TrajMode {
  FREE = Constants.TRAJ_MODE_FREE,
  COORD = Constants.TRAJ_MODE_COORD,
  TELEOP = Constants.TRAJ_MODE_TELEOP,
}

export enum MotionType {
  NONE = Constants.MOTION_TYPE_NONE,
  TRAVERSE = Constants.EMC_MOTION_TYPE_TRAVERSE,
  FEED = Constants.EMC_MOTION_TYPE_FEED,
  ARC = Constants.EMC_MOTION_TYPE_ARC,
  TOOLCHANGE = Constants.EMC_MOTION_TYPE_TOOLCHANGE,
  PROBING = Constants.EMC_MOTION_TYPE_PROBING,
  INDEXROTARY = Constants.EMC_MOTION_TYPE_INDEXROTARY,
}

export enum KinematicsType {
  IDENTITY = Constants.KINEMATICS_IDENTITY,
  FORWARD_ONLY = Constants.KINEMATICS_FORWARD_ONLY,
  INVERSE_ONLY = Constants.KINEMATICS_INVERSE_ONLY,
  BOTH = Constants.KINEMATICS_BOTH,
}

export enum RcsStatus {
  UNINITIALIZED = Constants.RCS_STATUS_UNINITIALIZED,
  DONE = Constants.RCS_STATUS_DONE,
  EXEC = Constants.RCS_STATUS_EXEC,
  ERROR = Constants.RCS_STATUS_ERROR,
}

export enum ProgramUnits {
  INCH = 1, // CANON_UNITS_INCHES
  MM = 2, // CANON_UNITS_MM
  CM = 3, // CANON_UNITS_CM
}

export enum SpindleDirection {
  FORWARD = Constants.SPINDLE_FORWARD,
  REVERSE = Constants.SPINDLE_REVERSE,
  OFF = Constants.SPINDLE_OFF,
  INCREASE = Constants.SPINDLE_INCREASE, // For command, not usually a state
  DECREASE = Constants.SPINDLE_DECREASE, // For command
  CONSTANT = Constants.SPINDLE_CONSTANT, // For command
}

export enum CoolantMode { // Matches local #defines used for commands
  MIST_ON = Constants.MIST_ON,
  MIST_OFF = Constants.MIST_OFF,
  FLOOD_ON = Constants.FLOOD_ON,
  FLOOD_OFF = Constants.FLOOD_OFF,
}

export enum BrakeState { // Matches local #defines
  ENGAGE = Constants.BRAKE_ENGAGE,
  RELEASE = Constants.BRAKE_RELEASE,
}

export enum JogMode { // Matches local #defines
  STOP = Constants.JOG_STOP,
  CONTINUOUS = Constants.JOG_CONTINUOUS,
  INCREMENT = Constants.JOG_INCREMENT,
}

export enum AutoOpType { // Matches local #defines
  RUN = Constants.AUTO_RUN,
  PAUSE = Constants.AUTO_PAUSE,
  RESUME = Constants.AUTO_RESUME,
  STEP = Constants.AUTO_STEP,
  REVERSE = Constants.AUTO_REVERSE,
  FORWARD = Constants.AUTO_FORWARD,
}

export enum NmlMessageType {
  EMC_OPERATOR_ERROR = Constants.EMC_OPERATOR_ERROR_TYPE,
  EMC_OPERATOR_TEXT = Constants.EMC_OPERATOR_TEXT_TYPE,
  EMC_OPERATOR_DISPLAY = Constants.EMC_OPERATOR_DISPLAY_TYPE,
  NML_ERROR = Constants.NML_ERROR_TYPE,
  NML_TEXT = Constants.NML_TEXT_TYPE,
  NML_DISPLAY = Constants.NML_DISPLAY_TYPE,
}

export enum JointType {
  LINEAR = Constants.JOINT_TYPE_LINEAR,
  ANGULAR = Constants.JOINT_TYPE_ANGULAR,
}
