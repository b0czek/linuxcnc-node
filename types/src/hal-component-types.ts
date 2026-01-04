/**
 * HAL Component Types
 * 
 * Type definitions for HAL component-related interfaces and callbacks.
 */

import { HalType, HalPinDir, HalParamDir } from "./hal-types";

export const DEFAULT_POLL_INTERVAL = 10; // Default polling interval in milliseconds

export type HalWatchCallback = (
  newValue: number | boolean,
  oldValue: number | boolean,
  object: any // Using any to avoid circular dependency
) => void;

export interface HalWatchOptions {
  pollInterval?: number;
}

export interface HalWatchedObject {
  object: any; // Using any to avoid circular dependency
  lastValue: number | boolean;
  callbacks: Set<HalWatchCallback>;
}

// This interface describes the N-API HalComponent class instance
export interface NativeHalComponent {
  newPin(nameSuffix: string, type: HalType, direction: HalPinDir): boolean;
  newParam(nameSuffix: string, type: HalType, direction: HalParamDir): boolean;
  ready(): void;
  unready(): void;
  getProperty(name: string): number | boolean;
  setProperty(name: string, value: number | boolean): number | boolean;
  readonly name: string;
  readonly prefix: string;
}
