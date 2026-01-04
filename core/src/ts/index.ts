import { StatChannel, StatWatcherOptions } from "./statChannel";
import { CommandChannel } from "./commandChannel";
import { ErrorChannel, ErrorChannelOptions } from "./errorChannel";
import { PositionLogger } from "./positionLogger";

import { addon } from "./constants";

let nmlFilePath: string = addon.NMLFILE_DEFAULT;

/**
 * Sets the NML file path for communication with LinuxCNC.
 * This must be called before creating any channel instances if using a non-default path.
 * @param filePath Absolute path to the .nml file.
 */
export function setNmlFilePath(filePath: string): void {
  addon.setNmlFilePath(filePath);
  nmlFilePath = filePath;
}

/**
 * Gets the current NML file path.
 * @returns The NML file path being used.
 */
export function getNmlFilePath(): string {
  return addon.getNmlFilePath();
}

// Export runtime enums from constants
export * from "./constants";
// Re-export all type definitions from the types package
export type {
  LinuxCNCStat,
  TaskStat,
  MotionStat,
  IoStat,
  TrajectoryStat,
  JointStat,
  AxisStat,
  SpindleStat,
  ToolIoStat,
  CoolantIoStat,
  EmcPose,
  ToolEntry,
  ActiveGCodes,
  ActiveMCodes,
  ActiveSettings,
  LinuxCNCError,
  AvailableAxis,
  DebugFlags,
  LinuxCNCStatPaths,
  RecursivePartial,
  StatPropertyWatchCallback,
  ErrorCallback,
  NapiOptions,
  NapiStatChannelInstance,
  NapiCommandChannelInstance,
  NapiErrorChannelInstance,
  NapiPositionLoggerInstance,
} from "@linuxcnc-node/types";
export { StatChannel, CommandChannel, ErrorChannel, PositionLogger };
export { StatWatcherOptions, ErrorChannelOptions };
export { PositionPoint, PositionLoggerOptions } from "./positionLogger";
