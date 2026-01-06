import {
  LinuxCNCStat,
  ToolEntry,
  LinuxCNCError,
  RecursivePartial,
  TaskMode,
  TaskState,
  TrajMode,
  RcsStatus,
  EmcDebug,
} from "@linuxcnc/types";

// Interface for the NAPI addon module itself
export interface NapiOptions {
  setNmlFilePath: (path: string) => void;
  getNmlFilePath: () => string;
  NativeStatChannel: { new (): NapiStatChannelInstance };
  NativeCommandChannel: { new (): NapiCommandChannelInstance };
  NativeErrorChannel: { new (): NapiErrorChannelInstance };
  NativePositionLogger: { new (): NapiPositionLoggerInstance };

  // Constants (as defined in nml_addon.cc)
  NMLFILE_DEFAULT: string;

  EMCMOT_MAX_JOINTS: number;
  EMCMOT_MAX_AXIS: number;
  EMCMOT_MAX_SPINDLES: number;
  EMCMOT_MAX_DIO: number;
  EMCMOT_MAX_AIO: number;
  EMCMOT_MAX_MISC_ERROR: number;
}

// Interface for the NapiStatChannel instance
export interface NapiStatChannelInstance {
  poll(): boolean; // Returns true if data was updated
  getCurrentFullStat(): LinuxCNCStat;
  disconnect(): void; // Disconnects from NML channel
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
  setDebugLevel(level: EmcDebug): Promise<RcsStatus>;
  sendOperatorError(message: string): Promise<RcsStatus>;
  sendOperatorText(message: string): Promise<RcsStatus>;
  sendOperatorDisplay(message: string): Promise<RcsStatus>;

  // Misc
  disconnect(): void;
  waitComplete(timeout?: number): RcsStatus; // Keep this synchronous
  serial: number; // For the command serial number
}

// Interface for the NapiErrorChannel instance
export interface NapiErrorChannelInstance {
  poll(): LinuxCNCError | null;
  disconnect(): void;
}

// Interface for the NapiPositionLogger instance
export interface NapiPositionLoggerInstance {
  start(interval?: number, maxHistorySize?: number): void;
  stop(): void;
  clear(): void;
  getCurrentPosition(): Float64Array | null;
  getMotionHistory(startIndex?: number, count?: number): Float64Array;
  getHistoryCount(): number;
}
