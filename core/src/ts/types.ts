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
  JointType,
  OrientState,
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

export interface ActiveGCodes {
  motionMode: number; // G0, G1, G2, G3, G38.2, G80, G81, G82, G83, G84, G85, G86, G87, G88, G89
  gMode0: number; // G4, G10, G28, G30, G53, G92, G92.1, G92.2, G92.3
  plane: number; // G17, G18, G19
  cutterComp: number; // G40, G41, G42
  units: number; // G20, G21
  distanceMode: number; // G90, G91
  feedRateMode: number; // G93, G94, G95
  origin: number; // G54-G59.3
  toolLengthOffset: number; // G43, G49
  retractMode: number; // G98, G99
  pathControl: number; // G61, G61.1, G64
  spindleSpeedMode: number; // G96, G97
  ijkDistanceMode: number; // G90.1, G91.1
  latheDiameterMode: number; // G7, G8
  g92Applied: number; // G92.2, G92.3
}

export interface ActiveMCodes {
  stopping: number; // M0, M1, M2, M30, M60
  spindleControl: number; // M3, M4, M5
  toolChange: number; // M6
  mistCoolant: number; // M7, M9
  floodCoolant: number; // M8, M9
  overrideControl: number; // M48, M49, M50, M51
  adaptiveFeedControl: number; // M52
  feedHoldControl: number; // M53
}

export interface ActiveSettings {
  feedRate: number;
  speed: number;
  blendTolerance: number;
  naiveCAMTolerance: number;
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
  rotationXY: number;
  toolOffset: EmcPose;
  activeGCodes: ActiveGCodes;
  activeMCodes: ActiveMCodes;
  activeSettings: ActiveSettings;
  programUnits: ProgramUnits;
  interpreterErrorCode: number;
  taskPaused: boolean;
  delayLeft: number;
  queuedMdiCommands: number;
}

export interface JointStat {
  jointType: JointType;
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
  orientState: OrientState;
  orientFault: number; // fault code from motion.spindle-orient-fault
  spindleOverrideEnabled: boolean;
  homed: boolean;
}

export interface TrajectoryStat {
  linearUnits: number;
  angularUnits: number;
  cycleTime: number;
  joints: number; // Number of joints configured
  spindles: number; // Number of spindles configured
  availableAxes: ("X" | "Y" | "Z" | "A" | "B" | "C" | "U" | "V" | "W")[]; // Available axes as defined by [TRAJ]COORDINATES
  mode: TrajMode;
  enabled: boolean;
  inPosition: boolean;
  queue: number;
  activeQueue: number;
  queueFull: boolean;
  id: number; // motion ID
  paused: boolean;
  feedRateOverride: number;
  rapidRateOverride: number;
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
}

export interface IoStat {
  tool: ToolIoStat;
  coolant: CoolantIoStat;
  estop: boolean;
}

export interface LinuxCNCStat {
  echoSerialNumber: number;
  state: RcsStatus; // Overall status of the NML update itself
  task: TaskStat;
  motion: MotionStat;
  io: IoStat;
  debug: number; // Top-level debug flags

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
