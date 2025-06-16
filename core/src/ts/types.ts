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
} from "./constants";

export interface EmcPose {
  x: number;
  y: number;
  z: number;
  a: number;
  b: number;
  c: number;
  u: number;
  v: number;
  w: number;
}

export interface ToolEntry {
  toolNo: number;
  pocketNo: number;
  offset: EmcPose;
  diameter: number;
  frontAngle: number;
  backAngle: number;
  orientation: number;
  comment: string;
}

export interface TaskStat {
  mode: TaskMode;
  state: TaskState;
  execState: ExecState;
  interpState: InterpState;
  callLevel: number;
  motionLine: number;
  currentLine: number;
  readLine: number;
  optionalStopState: boolean;
  blockDeleteState: boolean;
  inputTimeout: boolean;
  file: string;
  command: string;
  iniFilename: string;
  g5xOffset: EmcPose;
  g5xIndex: number;
  g92Offset: EmcPose;
  rotationXy: number;
  toolOffset: EmcPose;
  activeGCodes: number[];
  activeMCodes: number[];
  activeSettings: number[]; // [feed, speed, G64 P, G64 Q]
  programUnits: ProgramUnits;
  interpreterErrorCode: number;
  taskPaused: boolean;
  delayLeft: number;
  queuedMdiCommands: number;
  heartbeat: number;
}

export interface JointStat {
  jointType: number; // 1 for linear, 2 for angular
  units: number;
  backlash: number;
  minPositionLimit: number;
  maxPositionLimit: number;
  minFerror: number;
  maxFerror: number;
  ferrorCurrent: number;
  ferrorHighMark: number;
  output: number; // commanded position
  input: number; // actual position
  velocity: number;
  inPosition: boolean;
  homing: boolean;
  homed: boolean;
  fault: boolean;
  enabled: boolean;
  minSoftLimit: boolean;
  maxSoftLimit: boolean;
  minHardLimit: boolean;
  maxHardLimit: boolean;
  overrideLimits: boolean;
}

export interface AxisStat {
  minPositionLimit: number;
  maxPositionLimit: number;
  velocity: number;
}

export interface SpindleStat {
  speed: number;
  override: number; // override
  cssMaximum: number;
  cssFactor: number;
  direction: -1 | 0 | 1; // reverse, off, forward
  brake: boolean;
  increasing: -1 | 0 | 1; // decreasing, none, increasing
  enabled: boolean;
  orientState: number; // TODO: define enum if available
  orientFault: number; // TODO: define enum if available
  spindleOverrideEnabled: boolean;
  homed: boolean;
}

export interface TrajectoryStat {
  linearUnits: number;
  angularUnits: number;
  cycleTime: number;
  joints: number; // Number of joints configured
  spindles: number; // Number of spindles configured
  axisMask: number;
  mode: TrajMode;
  enabled: boolean;
  inPosition: boolean;
  queue: number;
  activeQueue: number;
  queueFull: boolean;
  id: number; // motion ID
  paused: boolean;
  feedrateOverride: number;
  rapidrateOverride: number;
  position: EmcPose;
  actualPosition: EmcPose;
  velocity: number; // commanded velocity for next segment
  acceleration: number; // commanded acceleration
  maxVelocity: number;
  maxAcceleration: number;
  probedPosition: EmcPose;
  probeTripped: boolean;
  probing: boolean;
  probeVal: number; // 0 or 1 usually
  kinematicsType: KinematicsType;
  motionType: MotionType;
  distanceToGo: number;
  dtg: EmcPose; // distance to go per axis
  currentVel: number;
  feedOverrideEnabled: boolean;
  adaptiveFeedEnabled: boolean;
  feedHoldEnabled: boolean;
  // tag: StateTag; // Complex, handle if needed
}

export interface ToolIoStat {
  pocketPrepped: number;
  toolInSpindle: number;
  toolFromPocket: number;
  // toolTable is part of the root LinuxCNCStat for direct access
}

export interface CoolantIoStat {
  mist: boolean;
  flood: boolean;
}

export interface MotionStat {
  traj: TrajectoryStat;
  joint: JointStat[]; // Array matching EMCMOT_MAX_JOINTS
  axis: AxisStat[]; // Array matching EMCMOT_MAX_AXIS
  spindle: SpindleStat[]; // Array matching EMCMOT_MAX_SPINDLES
  digitalInput: number[]; // Digital inputs state
  digitalOutput: number[]; // Digital outputs state
  analogInput: number[];
  analogOutput: number[];
  debug: number;
  numExtraJoints: number;
  // miscError: number[];
  // onSoftLimit: boolean;
  // externalOffsetsApplied: boolean;
  // eoffsetPose: EmcPose;
  // joggingActive: boolean;
}

export interface IoStat {
  tool: ToolIoStat;
  coolant: CoolantIoStat;
  estop: boolean;
  // debug: number;
  // reason: number;
  // fault: number;
}

export interface LinuxCNCStat {
  echoSerialNumber: number;
  state: RcsStatus; // Overall status of the NML update itself
  task: TaskStat;
  motion: MotionStat;
  io: IoStat;
  debug: number; // Top-level debug flags

  // Derived/convenience properties from Python binding, directly on root
  homed: boolean[];
  limit: number[]; // Bitmask: 1=minHard, 2=maxHard, 4=minSoft, 8=maxSoft
  toolTable: ToolEntry[];
}

export interface LinuxCNCError {
  type: NmlMessageType;
  message: string;
}

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

// Callback types
export type StatPropertyWatchCallback = (
  newValue: any,
  oldValue: any,
  propertyPath: LinuxCNCStatPaths
) => void;
export type FullStatChangeCallback = (
  newStat: LinuxCNCStat,
  oldStat: LinuxCNCStat | null
) => void;
export type ErrorCallback = (error: LinuxCNCError) => void;
