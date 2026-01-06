// HAL type definitions for LinuxCNC

export type HalType = "bit" | "float" | "s32" | "u32" | "s64" | "u64";

export type HalPinDir = "in" | "out" | "io";

export type HalParamDir = "ro" | "rw";

export type RtapiMsgLevel = "none" | "err" | "warn" | "info" | "dbg" | "all";

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
