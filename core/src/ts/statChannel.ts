import { EventEmitter } from "node:events";
import { NapiStatChannelInstance } from "./native_type_interfaces";
import {
  LinuxCNCStat,
  LinuxCNCStatPaths,
  StatPropertyWatchCallback,
  ToolEntry,
} from "@linuxcnc/types";
import { addon } from "./constants";
import isEqual from "fast-deep-equal";
import delve from "dlv";
export const DEFAULT_STAT_POLL_INTERVAL = 50; // ms

export interface StatWatcherOptions {
  pollInterval?: number;
}

interface WatchedProperty {
  lastValue: any;
}

export class StatChannel extends EventEmitter {
  private nativeInstance: NapiStatChannelInstance;
  private pollInterval: number;
  private poller: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;

  private currentStat: LinuxCNCStat | null = null;
  private watchedProperties: Map<LinuxCNCStatPaths, WatchedProperty> =
    new Map();

  constructor(options?: StatWatcherOptions) {
    super();
    this.nativeInstance = new addon.NativeStatChannel();
    this.currentStat = this.nativeInstance.getCurrentFullStat();

    this.pollInterval = options?.pollInterval ?? DEFAULT_STAT_POLL_INTERVAL;

    // Initial poll to populate currentStat
    if (this.nativeInstance.poll()) {
      this.currentStat = this.nativeInstance.getCurrentFullStat();
    }
    this.startPolling();
  }

  private startPolling(): void {
    if (this.poller || !this.nativeInstance) return;
    this.poller = setInterval(() => this.performPoll(), this.pollInterval);
  }

  private stopPolling(): void {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
  }

  private async performPoll(): Promise<void> {
    if (this.isPolling) return; // Prevent re-entrancy
    this.isPolling = true;

    try {
      const updated = this.nativeInstance.poll();
      if (updated) {
        const newStat = this.nativeInstance.getCurrentFullStat();
        this.currentStat = newStat; // Update immediately for getters

        // Notify individual property watchers via EventEmitter
        this.watchedProperties.forEach((watchedInfo, path) => {
          const newValue = delve(newStat, path);
          if (!isEqual(newValue, watchedInfo.lastValue)) {
            const oldValueForCallback = watchedInfo.lastValue;
            // Deep clone newValue if it's an object/array to prevent modification issues
            watchedInfo.lastValue =
              typeof newValue === "object" && newValue !== null
                ? JSON.parse(JSON.stringify(newValue))
                : newValue;
            // Emit the event to each listener individually to handle errors
            // Use rawListeners to get the actual listener wrappers (needed for once() to work)
            const listeners = this.rawListeners(path);
            for (const listener of listeners) {
              try {
                // Call the listener - for once() wrappers, this properly removes them
                (listener as (...args: any[]) => void)(
                  newValue,
                  oldValueForCallback,
                  path
                );
              } catch (e) {
                console.error(
                  `Error in StatChannel watch callback for ${path}:`,
                  e
                );
              }
            }
          }
        });
      }
    } catch (e) {
      console.error("Error during StatChannel poll:", e);
      // Potentially stop polling or attempt to reconnect if native throws
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Ensures that a property path is being tracked for changes.
   * This initializes the lastValue for comparing changes.
   */
  private ensureWatched(propertyPath: LinuxCNCStatPaths): void {
    if (!this.watchedProperties.has(propertyPath)) {
      const initialValue = this.currentStat
        ? delve(this.currentStat, propertyPath)
        : null;
      this.watchedProperties.set(propertyPath, {
        lastValue:
          typeof initialValue === "object" && initialValue !== null
            ? JSON.parse(JSON.stringify(initialValue))
            : initialValue,
      });
    }
  }

  /**
   * Registers a listener for changes to a specific property path.
   * @param propertyPath A dot-separated path to the property (e.g., "task.motionLine", "motion.joint.0.homed").
   * @param listener The function to call when the property's value changes.
   * @returns this (for chaining)
   */
  on<P extends LinuxCNCStatPaths>(
    propertyPath: P,
    listener: StatPropertyWatchCallback<P>
  ): this {
    this.ensureWatched(propertyPath);
    return super.on(propertyPath, listener as (...args: any[]) => void);
  }

  /**
   * Registers a one-time listener for changes to a specific property path.
   * The listener will be removed after it fires once.
   * @param propertyPath A dot-separated path to the property.
   * @param listener The function to call when the property's value changes.
   * @returns this (for chaining)
   */
  once<P extends LinuxCNCStatPaths>(
    propertyPath: P,
    listener: StatPropertyWatchCallback<P>
  ): this {
    this.ensureWatched(propertyPath);
    return super.once(propertyPath, listener as (...args: any[]) => void);
  }

  /**
   * Removes a listener for a specific property path.
   * @param propertyPath The property path.
   * @param listener The listener function to remove.
   * @returns this (for chaining)
   */
  off<P extends LinuxCNCStatPaths>(
    propertyPath: P,
    listener: StatPropertyWatchCallback<P>
  ): this {
    const result = super.off(
      propertyPath,
      listener as (...args: any[]) => void
    );
    // Clean up the watched property if no more listeners
    if (this.listenerCount(propertyPath) === 0) {
      this.watchedProperties.delete(propertyPath);
    }
    return result;
  }

  /**
   * Removes a listener for a specific property path.
   * Alias for off().
   * @param propertyPath The property path.
   * @param listener The listener function to remove.
   * @returns this (for chaining)
   */
  removeListener<P extends LinuxCNCStatPaths>(
    propertyPath: P,
    listener: StatPropertyWatchCallback<P>
  ): this {
    return this.off(propertyPath, listener);
  }

  /**
   * Sets the polling interval for status updates.
   * @param interval The new interval in milliseconds.
   */
  setPollInterval(interval: number): void {
    this.pollInterval = Math.max(10, interval); // Ensure a minimum interval
    this.stopPolling();
    this.startPolling();
  }

  /**
   * Gets the current polling interval.
   * @returns The interval in milliseconds.
   */
  getPollInterval(): number {
    return this.pollInterval;
  }

  /**
   * Retrieves the most recent full status object.
   * @returns The current LinuxCNCStat object, or null if not yet available.
   */
  get(): LinuxCNCStat | null {
    return this.currentStat;
  }

  /**
   * Cleans up resources, stopping the polling timer.
   */
  destroy(): void {
    this.stopPolling();
    this.watchedProperties.clear();
    this.removeAllListeners();
    // Properly disconnect from the native NML channel
    if (this.nativeInstance) {
      this.nativeInstance.disconnect();
    }
  }

  // --- Convenience Getters for common properties ---
  // These access the locally cached `this.currentStat`

  get task(): LinuxCNCStat["task"] | undefined {
    return this.currentStat?.task;
  }
  get motion(): LinuxCNCStat["motion"] | undefined {
    return this.currentStat?.motion;
  }
  get io(): LinuxCNCStat["io"] | undefined {
    return this.currentStat?.io;
  }
  get toolTable(): ToolEntry[] | undefined {
    return this.currentStat?.toolTable;
  }
}
