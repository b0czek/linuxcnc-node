import {
  NapiOptions,
  NapiStatChannelInstance,
  NapiCommandChannelInstance,
  NapiErrorChannelInstance,
} from "./native_type_interfaces";
import { StatChannel, StatWatcherOptions } from "./statChannel";
import { CommandChannel } from "./commandChannel";
import { ErrorChannel, ErrorWatcherOptions } from "./errorChannel";

import { Constants, addon } from "./constants";

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

/**
 * Creates a new StatChannel instance.
 * @param options Optional configuration for the stat channel's watcher.
 * @returns A new StatChannel.
 */
export function createStatChannel(options?: StatWatcherOptions): StatChannel {
  const nativeInstance =
    new addon.NativeStatChannel() as NapiStatChannelInstance;
  return new StatChannel(nativeInstance, options);
}

/**
 * Creates a new CommandChannel instance.
 * @returns A new CommandChannel.
 */
export function createCommandChannel(): CommandChannel {
  const nativeInstance =
    new addon.NativeCommandChannel() as NapiCommandChannelInstance;
  return new CommandChannel(nativeInstance);
}

/**
 * Creates a new ErrorChannel instance.
 * @param options Optional configuration for the error channel's watcher.
 * @returns A new ErrorChannel.
 */
export function createErrorChannel(
  options?: ErrorWatcherOptions
): ErrorChannel {
  const nativeInstance =
    new addon.NativeErrorChannel() as NapiErrorChannelInstance;
  return new ErrorChannel(nativeInstance, options);
}

// Export all enums and types
export * from "./enums";
export * from "./types";
export { StatChannel, CommandChannel, ErrorChannel };
export { StatWatcherOptions, ErrorWatcherOptions };
export { Constants } from "./constants";
