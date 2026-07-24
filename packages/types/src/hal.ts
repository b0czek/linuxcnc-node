// HAL type definitions for LinuxCNC

export type HalType = "bit" | "float" | "s32" | "u32" | "s64" | "u64";

export type HalPinDir = "in" | "out" | "io";

export type HalParamDir = "ro" | "rw";

export type RtapiMsgLevel = "none" | "err" | "warn" | "info" | "dbg" | "all";

export type HalValue = boolean | number;

export type HalItemKind = "pin" | "param" | "signal";

/** Stable identity for a readable HAL value. */
export interface HalItemRef {
  kind: HalItemKind;
  name: string;
}

export type HalComponentKind = "user" | "realtime" | "other" | "unknown";

export interface HalComponentInfo {
  id: number;
  name: string;
  kind: HalComponentKind;
  ready: boolean;
  pid?: number;
}

export interface HalFunctionInfo {
  name: string;
  ownerId: number;
  ownerName: string;
  usesFp: boolean;
  reentrant: boolean;
  users: number;
  runtime?: number;
  maxRuntime: number;
  maxRuntimeIncreased: boolean;
}

export interface HalThreadInfo {
  name: string;
  periodNs: number;
  priority: number;
  usesFp: boolean;
  running: boolean;
  runtime?: number;
  maxRuntime: number;
  functions: string[];
}

export type ScopeRuntimeState =
  | "idle"
  | "init"
  | "pre-trigger"
  | "trigger-wait"
  | "post-trigger"
  | "done"
  | "reset"
  | "invalid";

export interface ScopeChannelConfig extends HalItemRef {
  enabled?: boolean;
}

export interface ScopeAcquisitionConfig {
  threadName: string;
  multiplier: number;
  preTrigger: number;
  triggerChannel: number;
  triggerLevel: number;
  rising: boolean;
  automatic: boolean;
  channels: Array<ScopeChannelConfig | null>;
}

export interface ScopeStatus {
  state: ScopeRuntimeState;
  bufferLength: number;
  recordLength: number;
  sampleLength: number;
  samples: number;
  start: number;
  multiplier: number;
  watchdog: number;
  threadName: string;
  samplePeriodNs: number;
}

export interface ScopeCapture {
  channels: Array<Float64Array | null>;
  samples: number;
  triggerIndex: number;
  samplePeriodNs: number;
}

export interface HalPinInfo {
  name: string;
  value: any;
  type: HalType;
  direction: HalPinDir;
  ownerId: number;
  // undefined if pin is not connected to a signal
  signalName?: string;
}

export interface HalSignalInfo {
  name: string;
  value: any;
  type: HalType;
  driver: string | null; // Name of the driving pin
  readers: number;
  writers: number;
  bidirs: number;
}

export interface HalParamInfo {
  name: string;
  value: any;
  type: HalType;
  direction: HalParamDir;
  ownerId: number;
}
