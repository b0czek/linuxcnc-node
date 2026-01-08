import { EventEmitter } from "node:events";
import {
  NapiStatChannelInstance,
  StatChange,
  StatDeltaResult,
} from "./native_type_interfaces";
import {
  LinuxCNCStat,
  LinuxCNCStatPaths,
  StatPropertyWatchCallback,
  ToolEntry,
} from "@linuxcnc-node/types";
import { addon } from "./constants";
import delve from "dlv";
import { dset } from "dset";
export const DEFAULT_STAT_POLL_INTERVAL = 50; // ms

// Re-export delta types for external use
export type { StatChange, StatDeltaResult } from "./native_type_interfaces";

export interface StatWatcherOptions {
  pollInterval?: number;
}

interface WatchedProperty {
  lastValue: unknown;
}

export class StatChannel extends EventEmitter {
  private nativeInstance: NapiStatChannelInstance;
  private pollInterval: number;
  private poller: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private cursor: number = 0;

  private currentStat: LinuxCNCStat | null = null;
  private watchedProperties: Map<LinuxCNCStatPaths, WatchedProperty> =
    new Map();

  constructor(options?: StatWatcherOptions) {
    super();
    this.nativeInstance = new addon.NativeStatChannel();
    this.pollInterval = options?.pollInterval ?? DEFAULT_STAT_POLL_INTERVAL;

    // Initial full sync to populate currentStat
    this.currentStat = {} as LinuxCNCStat;
    const initialResult = this.nativeInstance.poll(true); // force=true gets all fields
    for (const change of initialResult.changes) {
      dset(this.currentStat, change.path, change.value);
    }
    this.cursor = initialResult.cursor;
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

  private performPoll(): void {
    if (this.isPolling) return; // Prevent re-entrancy
    this.isPolling = true;

    try {
      const result = this.nativeInstance.poll();
      this.cursor = result.cursor;

      if (result.changes.length > 0 && this.currentStat) {
        // Apply deltas incrementally to local state (no full stat fetch)
        for (const change of result.changes) {
          dset(this.currentStat, change.path, change.value);
        }

        // Emit raw deltas for listeners who want the batch
        this.emit("delta", result.changes);

        // Notify individual property watchers via EventEmitter
        // Only check properties that actually changed (from C++)
        for (const change of result.changes) {
          const path = change.path as LinuxCNCStatPaths;
          const watched = this.watchedProperties.get(path);
          if (watched) {
            const oldValue = watched.lastValue;
            const newValue = change.value;
            // Update lastValue
            watched.lastValue =
              typeof newValue === "object" && newValue !== null
                ? JSON.parse(JSON.stringify(newValue))
                : newValue;

            // Emit to listeners
            const listeners = this.rawListeners(path);
            for (const listener of listeners) {
              try {
                (listener as (...args: unknown[]) => void)(
                  newValue,
                  oldValue,
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
        }
      }
    } catch (e) {
      console.error("Error during StatChannel poll:", e);
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
  on(event: "delta", listener: (changes: StatChange[]) => void): this;
  on<P extends LinuxCNCStatPaths>(
    propertyPath: P,
    listener: StatPropertyWatchCallback<P>
  ): this;
  on(
    event: string | LinuxCNCStatPaths,
    listener: ((...args: any[]) => void) | StatPropertyWatchCallback<any>
  ): this {
    if (event === "delta") {
      return super.on(event, listener as (...args: any[]) => void);
    }
    this.ensureWatched(event as LinuxCNCStatPaths);
    return super.on(event, listener as (...args: any[]) => void);
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
  off(event: "delta", listener: (changes: StatChange[]) => void): this;
  off<P extends LinuxCNCStatPaths>(
    propertyPath: P,
    listener: StatPropertyWatchCallback<P>
  ): this;
  off(
    event: string | LinuxCNCStatPaths,
    listener: ((...args: any[]) => void) | StatPropertyWatchCallback<any>
  ): this {
    if (event === "delta") {
      return super.off(event, listener as (...args: any[]) => void);
    }
    const result = super.off(event, listener as (...args: any[]) => void);
    // Clean up the watched property if no more listeners
    if (this.listenerCount(event) === 0) {
      this.watchedProperties.delete(event as LinuxCNCStatPaths);
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
   * Forces a full resync of the stat object from native.
   * Use this if cursor gaps are detected or for initial sync scenarios.
   */
  sync(): void {
    this.currentStat = {} as LinuxCNCStat;
    const result = this.nativeInstance.poll(true); // force=true gets all fields
    for (const change of result.changes) {
      dset(this.currentStat, change.path, change.value);
    }
    this.cursor = result.cursor;
    // Update all watched property lastValues
    this.watchedProperties.forEach((watched, path) => {
      watched.lastValue = this.currentStat
        ? delve(this.currentStat, path)
        : null;
    });
  }

  /**
   * Gets the current cursor value for sync verification.
   * The cursor increments each time the native layer detects changes.
   * @returns The current cursor value.
   */
  getCursor(): number {
    return this.cursor;
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
