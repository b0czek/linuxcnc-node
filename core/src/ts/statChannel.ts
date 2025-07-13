import { NapiStatChannelInstance } from "./native_type_interfaces";
import {
  LinuxCNCStat,
  LinuxCNCStatPaths,
  StatPropertyWatchCallback,
  FullStatChangeCallback,
  ToolEntry,
  EmcPose,
} from "./types";
import {
  TaskMode,
  TaskState,
  ExecState,
  InterpState,
  TrajMode,
  MotionType,
  ProgramUnits,
  RcsStatus,
  addon,
} from "./constants";
import isEqual from "fast-deep-equal";
import delve from "dlv";
export const DEFAULT_STAT_POLL_INTERVAL = 50; // ms

export interface StatWatcherOptions {
  pollInterval?: number;
}

export interface WatchOptions {
  /** If true, the callback will be called immediately with the current value */
  immediate?: boolean;
  /** If true, the callback will be automatically removed after it fires once */
  once?: boolean;
}

interface WatchedProperty {
  lastValue: any;
  callbacks: Set<StatPropertyWatchCallback<any>>;
}

export class StatChannel {
  private nativeInstance: NapiStatChannelInstance;
  private pollInterval: number;
  private poller: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;

  private currentStat: LinuxCNCStat | null = null;
  private watchedProperties: Map<LinuxCNCStatPaths, WatchedProperty> =
    new Map();
  private fullChangeCallbacks: Set<FullStatChangeCallback> = new Set();

  constructor(options?: StatWatcherOptions) {
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
        const oldStat = this.currentStat;
        this.currentStat = newStat; // Update immediately for getters

        // Notify full change listeners
        this.fullChangeCallbacks.forEach((cb) => {
          try {
            cb(newStat, oldStat);
          } catch (e) {
            console.error("Error in full StatChannel change callback:", e);
          }
        });

        // Notify individual property watchers
        this.watchedProperties.forEach((watchedInfo, path) => {
          const newValue = delve(newStat, path);
          if (!isEqual(newValue, watchedInfo.lastValue)) {
            const oldValueForCallback = watchedInfo.lastValue;
            // Deep clone newValue if it's an object/array to prevent modification issues
            watchedInfo.lastValue =
              typeof newValue === "object" && newValue !== null
                ? JSON.parse(JSON.stringify(newValue))
                : newValue;
            watchedInfo.callbacks.forEach((cb) => {
              try {
                cb(newValue, oldValueForCallback, path);
              } catch (e) {
                console.error(
                  `Error in StatChannel watch callback for ${path}:`,
                  e
                );
              }
            });
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
   * Adds a callback to be invoked when any part of the LinuxCNCStat object changes.
   * @param callback The function to call on any change.
   */
  onFullChange(callback: FullStatChangeCallback): void {
    this.fullChangeCallbacks.add(callback);
  }

  /**
   * Removes a full change callback.
   * @param callback The callback function to remove.
   */
  removeFullChange(callback: FullStatChangeCallback): void {
    this.fullChangeCallbacks.delete(callback);
  }

  /**
   * Watches a specific property path within the LinuxCNCStat object for changes.
   * @param propertyPath A dot-separated path to the property (e.g., "task.motionLine", "motion.joint.0.homed").
   * @param callback The function to call when the property's value changes.
   * @param options Options for the watch behavior.
   */
  addWatch<P extends LinuxCNCStatPaths>(
    propertyPath: P,
    callback: StatPropertyWatchCallback<P>,
    options: WatchOptions = {}
  ): void {
    const { immediate = false, once = false } = options;

    let actualCallback = callback;

    // If once is true, wrap the callback to remove itself after firing
    if (once) {
      actualCallback = (newValue, oldValue, path) => {
        // Remove the wrapper callback first
        this.removeWatch(propertyPath, actualCallback);
        // Then call the original callback
        callback(newValue, oldValue, path);
      };
    }

    let watchedInfo = this.watchedProperties.get(propertyPath);
    if (!watchedInfo) {
      const initialValue = this.currentStat
        ? delve(this.currentStat, propertyPath)
        : null;
      watchedInfo = {
        lastValue:
          typeof initialValue === "object" && initialValue !== null
            ? JSON.parse(JSON.stringify(initialValue))
            : initialValue,
        callbacks: new Set(),
      };
      this.watchedProperties.set(propertyPath, watchedInfo);
    }
    watchedInfo.callbacks.add(actualCallback);

    // Notify immediately if requested
    if (immediate && this.currentStat) {
      const currentValue = delve(this.currentStat, propertyPath);
      try {
        callback(currentValue, null, propertyPath);
      } catch (e) {
        console.error(
          `Error in immediate StatChannel watch callback for ${propertyPath}:`,
          e
        );
      }
    }
  }

  /**
   * Removes a watch callback for a specific property path.
   * @param propertyPath The property path.
   * @param callback The callback function to remove.
   */
  removeWatch<P extends LinuxCNCStatPaths>(
    propertyPath: P,
    callback: StatPropertyWatchCallback<P>
  ): void {
    const watchedInfo = this.watchedProperties.get(propertyPath);
    if (watchedInfo) {
      watchedInfo.callbacks.delete(callback);
      if (watchedInfo.callbacks.size === 0) {
        this.watchedProperties.delete(propertyPath);
      }
    }
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
  getStat(): LinuxCNCStat | null {
    return this.currentStat;
  }

  /**
   * Cleans up resources, stopping the polling timer.
   */
  destroy(): void {
    this.stopPolling();
    this.watchedProperties.clear();
    this.fullChangeCallbacks.clear();
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
