import {
  LinuxCNCError,
  RcsStatus,
  StatChange,
} from "@linuxcnc-node/types";
import type { NativeCommandMethods } from "@linuxcnc-node/types";

// Interface for the NAPI addon module itself
export interface NapiOptions {
  setNmlFilePath: (path: string) => void;
  getNmlFilePath: () => string;
  NativeStatChannel: { new (): NapiStatChannelInstance };
  NativeCommandChannel: {
    new (options?: NativeCommandChannelOptions): NapiCommandChannelInstance;
  };
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

export interface NativeCommandChannelOptions {
  waitMode?: "sent";
}

export interface CommandStatusSnapshot {
  echoSerial: number;
  status: RcsStatus;
}

/**
 * Delta update result from native polling.
 */
export interface StatDeltaResult {
  /** Array of changed properties */
  changes: StatChange[];
  /** Monotonic cursor for sync verification */
  cursor: number;
}

// Interface for the NapiStatChannel instance
export interface NapiStatChannelInstance {
  /**
   * Poll for changes.
   * @param force If true, returns all fields regardless of changes (for full sync)
   */
  poll(force?: boolean): StatDeltaResult;
  getCursor(): number;
  disconnect(): void;
}

// Interface for the NapiCommandChannel instance
export interface NapiCommandChannelInstance extends NativeCommandMethods {
  disconnect(): void;
  waitComplete(timeout?: number): RcsStatus; // Keep this synchronous
  getStatusSnapshot(): CommandStatusSnapshot;
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
