import {
  LinuxCNCStat,
  ToolEntry,
  LinuxCNCError,
  RecursivePartial,
} from "./types";
import { TaskMode, TaskState, TrajMode, RcsStatus } from "./constants";

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

  EMCMOT_ORIENT_NONE: number;
  EMCMOT_ORIENT_COMPLETE: number;
  EMCMOT_ORIENT_IN_PROGRESS: number;
  EMCMOT_ORIENT_FAULTED: number;
}

// Interface for the NapiStatChannel instance
export interface NapiStatChannelInstance {
  poll(): boolean; // Returns true if data was updated
  getCurrentFullStat(): LinuxCNCStat;
  toolInfo(toolNumber: number): ToolEntry;
}

// Interface for the NapiCommandChannel instance
export interface NapiCommandChannelInstance {
  // Task commands
  setTaskMode(mode: TaskMode): Promise<RcsStatus>;
  setState(state: TaskState): Promise<RcsStatus>;
  taskPlanSynch(): Promise<RcsStatus>;
  resetInterpreter(): Promise<RcsStatus>;
  programOpen(filePath: string): Promise<RcsStatus>;
  // auto commands are mapped to specific methods for clarity
  runProgram(startLine: number): Promise<RcsStatus>; // auto(AUTO_RUN, line)
  pauseProgram(): Promise<RcsStatus>; // auto(AUTO_PAUSE)
  resumeProgram(): Promise<RcsStatus>; // auto(AUTO_RESUME)
  stepProgram(): Promise<RcsStatus>; // auto(AUTO_STEP)
  reverseProgram(): Promise<RcsStatus>; // auto(AUTO_REVERSE)
  forwardProgram(): Promise<RcsStatus>; // auto(AUTO_FORWARD)
  abortTask(): Promise<RcsStatus>;
  setOptionalStop(enable: boolean): Promise<RcsStatus>;
  setBlockDelete(enable: boolean): Promise<RcsStatus>;
  mdi(command: string): Promise<RcsStatus>;

  // Trajectory commands
  setTrajMode(mode: TrajMode): Promise<RcsStatus>;
  setMaxVelocity(velocity: number): Promise<RcsStatus>;
  setFeedRate(scale: number): Promise<RcsStatus>;
  setRapidRate(scale: number): Promise<RcsStatus>;
  setSpindleOverride(scale: number, spindleIndex?: number): Promise<RcsStatus>;
  overrideLimits(): Promise<RcsStatus>;
  teleopEnable(enable: boolean): Promise<RcsStatus>;
  setFeedOverrideEnable(enable: boolean): Promise<RcsStatus>;
  setSpindleOverrideEnable(
    enable: boolean,
    spindleIndex?: number
  ): Promise<RcsStatus>;
  setFeedHoldEnable(enable: boolean): Promise<RcsStatus>;
  setAdaptiveFeedEnable(enable: boolean): Promise<RcsStatus>;

  // Joint commands
  homeJoint(jointIndex: number): Promise<RcsStatus>; // jointIndex -1 for all
  unhomeJoint(jointIndex: number): Promise<RcsStatus>; // jointIndex -1 for all
  jogStop(axisOrJointIndex: number, isJointJog: boolean): Promise<RcsStatus>;
  jogContinuous(
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number
  ): Promise<RcsStatus>;
  jogIncrement(
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number,
    increment: number
  ): Promise<RcsStatus>;
  setMinPositionLimit(jointIndex: number, limit: number): Promise<RcsStatus>;
  setMaxPositionLimit(jointIndex: number, limit: number): Promise<RcsStatus>;

  // Spindle commands
  spindleOn(
    speed: number,
    spindleIndex?: number,
    waitForSpeed?: boolean
  ): Promise<RcsStatus>;
  spindleIncrease(spindleIndex?: number): Promise<RcsStatus>;
  spindleDecrease(spindleIndex?: number): Promise<RcsStatus>;
  spindleOff(spindleIndex?: number): Promise<RcsStatus>;
  spindleBrake(engage: boolean, spindleIndex?: number): Promise<RcsStatus>;

  // Coolant commands
  setMist(on: boolean): Promise<RcsStatus>;
  setFlood(on: boolean): Promise<RcsStatus>;

  // Tool commands
  loadToolTable(): Promise<RcsStatus>;
  setTool(
    toolEntry: RecursivePartial<ToolEntry> & { toolNo: number }
  ): Promise<RcsStatus>;

  // IO commands
  setDigitalOutput(index: number, value: boolean): Promise<RcsStatus>;
  setAnalogOutput(index: number, value: number): Promise<RcsStatus>;

  // Debug & Message commands
  setDebugLevel(level: number): Promise<RcsStatus>;
  sendOperatorError(message: string): Promise<RcsStatus>;
  sendOperatorText(message: string): Promise<RcsStatus>;
  sendOperatorDisplay(message: string): Promise<RcsStatus>;

  // Misc
  waitComplete(timeout?: number): RcsStatus; // Keep this synchronous as it was reverted
  serial: number; // For the command serial number
}

// Interface for the NapiErrorChannel instance
export interface NapiErrorChannelInstance {
  poll(): LinuxCNCError | null;
}
