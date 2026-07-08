import type {
  EmcDebug,
  RcsStatus,
  TaskMode,
  TaskState,
  TrajMode,
} from "./constants";
import type { RecursivePartial, ToolEntry } from "./core";

export interface NativeCommandArguments {
  setTaskMode: [mode: TaskMode];
  setState: [state: TaskState];
  taskPlanSynch: [];
  resetInterpreter: [];
  programOpen: [filePath: string];
  programClose: [];
  runProgram: [startLine: number];
  pauseProgram: [];
  resumeProgram: [];
  stepProgram: [];
  reverseProgram: [];
  forwardProgram: [];
  stop: [];
  abortTask: [];
  setOptionalStop: [enable: boolean];
  setBlockDelete: [enable: boolean];
  mdi: [command: string];
  setTrajMode: [mode: TrajMode];
  setMaxVelocity: [velocity: number];
  setFeedRate: [scale: number];
  setRapidRate: [scale: number];
  setSpindleOverride: [scale: number, spindleIndex?: number];
  overrideLimits: [];
  teleopEnable: [enable: boolean];
  setFeedOverrideEnable: [enable: boolean];
  setSpindleOverrideEnable: [enable: boolean, spindleIndex?: number];
  setFeedHoldEnable: [enable: boolean];
  setAdaptiveFeedEnable: [enable: boolean];
  homeJoint: [jointIndex: number];
  unhomeJoint: [jointIndex: number];
  jogStop: [axisOrJointIndex: number, isJointJog: boolean];
  jogContinuous: [
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number,
  ];
  jogIncrement: [
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number,
    increment: number,
  ];
  setMinPositionLimit: [jointIndex: number, limit: number];
  setMaxPositionLimit: [jointIndex: number, limit: number];
  spindleOn: [speed: number, spindleIndex?: number, waitForSpeed?: boolean];
  spindleIncrease: [spindleIndex?: number];
  spindleDecrease: [spindleIndex?: number];
  spindleOff: [spindleIndex?: number];
  spindleBrake: [engage: boolean, spindleIndex?: number];
  setMist: [on: boolean];
  setFlood: [on: boolean];
  loadToolTable: [];
  setTool: [toolEntry: RecursivePartial<ToolEntry> & { toolNo: number }];
  setDigitalOutput: [index: number, value: boolean];
  setAnalogOutput: [index: number, value: number];
  setDebugLevel: [level: EmcDebug];
  sendOperatorError: [message: string];
  sendOperatorText: [message: string];
  sendOperatorDisplay: [message: string];
}

export type NativeCommandName = keyof NativeCommandArguments;

export type NativeCommandMethods<TResult = Promise<RcsStatus>> = {
  [K in NativeCommandName]: (
    ...args: NativeCommandArguments[K]
  ) => TResult;
};
