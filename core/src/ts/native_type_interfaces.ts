// src/ts/native_type_interfaces.ts
import { LinuxCNCStat, ToolData, LinuxCNCError, EmcPose } from "./types";
import {
  TaskMode,
  TaskState,
  TrajMode,
  CoolantMode,
  SpindleDirection,
  JogMode,
  AutoOpType,
  RcsStatus,
} from "./enums";

// Interface for the NAPI addon module itself
export interface NapiOptions {
  setNmlFilePath: (path: string) => void;
  getNmlFilePath: () => string;
  NativeStatChannel: { new (): NapiStatChannelInstance };
  NativeCommandChannel: { new (): NapiCommandChannelInstance };
  NativeErrorChannel: { new (): NapiErrorChannelInstance };

  // Constants (as defined in nml_addon.cc)
  NMLFILE_DEFAULT: string;

  TASK_MODE_MDI: number;
  TASK_MODE_MANUAL: number;
  TASK_MODE_AUTO: number;
  // TASK_MODE_TELEOP: number;

  TASK_STATE_ESTOP: number;
  TASK_STATE_ESTOP_RESET: number;
  TASK_STATE_OFF: number;
  TASK_STATE_ON: number;

  EXEC_STATE_ERROR: number;
  EXEC_STATE_DONE: number;
  EXEC_STATE_WAITING_FOR_MOTION: number;
  EXEC_STATE_WAITING_FOR_MOTION_QUEUE: number;
  EXEC_STATE_WAITING_FOR_IO: number;
  EXEC_STATE_WAITING_FOR_MOTION_AND_IO: number;
  EXEC_STATE_WAITING_FOR_DELAY: number;
  EXEC_STATE_WAITING_FOR_SYSTEM_CMD: number;
  EXEC_STATE_WAITING_FOR_SPINDLE_ORIENTED: number;

  INTERP_STATE_IDLE: number;
  INTERP_STATE_READING: number;
  INTERP_STATE_PAUSED: number;
  INTERP_STATE_WAITING: number;

  TRAJ_MODE_FREE: number;
  TRAJ_MODE_COORD: number;
  TRAJ_MODE_TELEOP: number;

  EMC_MOTION_TYPE_TRAVERSE: number;
  EMC_MOTION_TYPE_FEED: number;
  EMC_MOTION_TYPE_ARC: number;
  EMC_MOTION_TYPE_TOOLCHANGE: number;
  EMC_MOTION_TYPE_PROBING: number;
  EMC_MOTION_TYPE_INDEXROTARY: number;
  MOTION_TYPE_NONE: number;

  KINEMATICS_IDENTITY: number;
  KINEMATICS_FORWARD_ONLY: number;
  KINEMATICS_INVERSE_ONLY: number;
  KINEMATICS_BOTH: number;

  RCS_STATUS_UNINITIALIZED: number;
  RCS_STATUS_DONE: number;
  RCS_STATUS_EXEC: number;
  RCS_STATUS_ERROR: number;

  SPINDLE_FORWARD: number;
  SPINDLE_REVERSE: number;
  SPINDLE_OFF: number;
  SPINDLE_INCREASE: number;
  SPINDLE_DECREASE: number;
  SPINDLE_CONSTANT: number;

  MIST_ON: number;
  MIST_OFF: number;

  FLOOD_ON: number;
  FLOOD_OFF: number;

  BRAKE_ENGAGE: number;
  BRAKE_RELEASE: number;

  JOG_STOP: number;
  JOG_CONTINUOUS: number;
  JOG_INCREMENT: number;

  AUTO_RUN: number;
  AUTO_PAUSE: number;
  AUTO_RESUME: number;
  AUTO_STEP: number;
  AUTO_REVERSE: number;
  AUTO_FORWARD: number;

  EMCMOT_MAX_JOINTS: number;
  EMCMOT_MAX_AXIS: number;
  EMCMOT_MAX_SPINDLES: number;
  EMCMOT_MAX_DIO: number;
  EMCMOT_MAX_AIO: number;
  EMCMOT_MAX_MISC_ERROR: number;

  EMC_OPERATOR_ERROR_TYPE: number;
  EMC_OPERATOR_TEXT_TYPE: number;
  EMC_OPERATOR_DISPLAY_TYPE: number;
  NML_ERROR_TYPE: number;
  NML_TEXT_TYPE: number;
  NML_DISPLAY_TYPE: number;

  JOINT_TYPE_LINEAR: number;
  JOINT_TYPE_ANGULAR: number;
}

// Interface for the NapiStatChannel instance
export interface NapiStatChannelInstance {
  poll(): boolean; // Returns true if data was updated
  getCurrentFullStat(): LinuxCNCStat;
  toolInfo(toolNumber: number): ToolData;
}

// Interface for the NapiCommandChannel instance
export interface NapiCommandChannelInstance {
  // Task commands
  setMode(mode: TaskMode): RcsStatus;
  setState(state: TaskState): RcsStatus;
  taskPlanSynch(): RcsStatus;
  resetInterpreter(): RcsStatus;
  programOpen(filePath: string): RcsStatus;
  // auto commands are mapped to specific methods for clarity
  runProgram(startLine: number): RcsStatus; // auto(AUTO_RUN, line)
  pauseProgram(): RcsStatus; // auto(AUTO_PAUSE)
  resumeProgram(): RcsStatus; // auto(AUTO_RESUME)
  stepProgram(): RcsStatus; // auto(AUTO_STEP)
  reverseProgram(): RcsStatus; // auto(AUTO_REVERSE)
  forwardProgram(): RcsStatus; // auto(AUTO_FORWARD)
  abortTask(): RcsStatus;
  setOptionalStop(enable: boolean): RcsStatus;
  setBlockDelete(enable: boolean): RcsStatus;
  mdi(command: string): RcsStatus;

  // Trajectory commands
  setTrajMode(mode: TrajMode): RcsStatus;
  setMaxVelocity(velocity: number): RcsStatus;
  setFeedRate(scale: number): RcsStatus;
  setRapidRate(scale: number): RcsStatus;
  setSpindleOverride(scale: number, spindleIndex?: number): RcsStatus;
  overrideLimits(): RcsStatus;
  teleopEnable(enable: boolean): RcsStatus;
  setFeedOverrideEnable(enable: boolean): RcsStatus;
  setSpindleOverrideEnable(enable: boolean, spindleIndex?: number): RcsStatus;
  setFeedHoldEnable(enable: boolean): RcsStatus;
  setAdaptiveFeedEnable(enable: boolean): RcsStatus;

  // Joint commands
  homeJoint(jointIndex: number): RcsStatus; // jointIndex -1 for all
  unhomeJoint(jointIndex: number): RcsStatus; // jointIndex -1 for all
  jogStop(axisOrJointIndex: number, isJointJog: boolean): RcsStatus;
  jogContinuous(
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number
  ): RcsStatus;
  jogIncrement(
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number,
    increment: number
  ): RcsStatus;
  setMinPositionLimit(jointIndex: number, limit: number): RcsStatus;
  setMaxPositionLimit(jointIndex: number, limit: number): RcsStatus;

  // Spindle commands
  spindleOn(
    direction: SpindleDirection,
    speed?: number,
    spindleIndex?: number,
    waitForSpeed?: boolean
  ): RcsStatus;
  spindleIncrease(spindleIndex?: number): RcsStatus;
  spindleDecrease(spindleIndex?: number): RcsStatus;
  spindleConstant(spindleIndex?: number): RcsStatus;
  spindleOff(spindleIndex?: number): RcsStatus;
  spindleBrake(engage: boolean, spindleIndex?: number): RcsStatus;

  // Coolant commands
  setMist(on: boolean): RcsStatus;
  setFlood(on: boolean): RcsStatus;

  // Tool commands
  loadToolTable(): RcsStatus;
  setToolOffset(
    toolNumber: number,
    zOffset: number,
    xOffset: number,
    diameter: number,
    frontAngle: number,
    backAngle: number,
    orientation: number
  ): RcsStatus;

  // IO commands
  setDigitalOutput(index: number, value: boolean): RcsStatus;
  setAnalogOutput(index: number, value: number): RcsStatus;

  // Debug & Message commands
  setDebugLevel(level: number): RcsStatus;
  sendOperatorError(message: string): RcsStatus;
  sendOperatorText(message: string): RcsStatus;
  sendOperatorDisplay(message: string): RcsStatus;

  // Misc
  waitComplete(timeout?: number): RcsStatus;
  serial: number; // For the command serial number
}

// Interface for the NapiErrorChannel instance
export interface NapiErrorChannelInstance {
  poll(): LinuxCNCError | null;
}
