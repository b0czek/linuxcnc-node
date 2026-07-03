import { StatChannel, StatWatcherOptions } from "./statChannel";
import { CommandChannel } from "./commandChannel";
import { CommandChannelV2 } from "./commandChannelV2";
import type {
  CommandHandle,
  LockedCommandChannel,
  CommandAccepted,
  CommandWaitOptions,
  WaitableCommandHandle,
} from "./commandChannelV2";
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

export {
  StatChannel,
  CommandChannel,
  CommandChannelV2,
  ErrorChannel,
  PositionLogger,
};
export { StatWatcherOptions, ErrorChannelOptions };
export type {
  CommandHandle,
  LockedCommandChannel,
  CommandAccepted,
  CommandWaitOptions,
  WaitableCommandHandle,
};
export { PositionLoggerOptions } from "./positionLogger";
