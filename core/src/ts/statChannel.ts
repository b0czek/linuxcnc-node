import { NapiStatChannelInstance } from "./native_type_interfaces";
import {
  LinuxCNCStat,
  ToolData,
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
} from "./constants";
import isEqual from "lodash/isEqual";
import getPathValue from "lodash/get";
export const DEFAULT_STAT_POLL_INTERVAL = 50; // ms

export interface StatWatcherOptions {
  pollInterval?: number;
}

interface WatchedProperty {
  lastValue: any;
  callbacks: Set<StatPropertyWatchCallback>;
}

export class StatChannel {
  private nativeInstance: NapiStatChannelInstance;
  private pollInterval: number;
  private poller: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;

  private currentStat: LinuxCNCStat | null = null;
  private watchedProperties: Map<string, WatchedProperty> = new Map();
  private fullChangeCallbacks: Set<FullStatChangeCallback> = new Set();

  constructor(
    nativeInstance: NapiStatChannelInstance,
    options?: StatWatcherOptions
  ) {
    this.nativeInstance = nativeInstance;
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
          const newValue = getPathValue(newStat, path);
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
   */
  addWatch(propertyPath: string, callback: StatPropertyWatchCallback): void {
    let watchedInfo = this.watchedProperties.get(propertyPath);
    if (!watchedInfo) {
      const initialValue = this.currentStat
        ? getPathValue(this.currentStat, propertyPath)
        : undefined;
      watchedInfo = {
        lastValue:
          typeof initialValue === "object" && initialValue !== null
            ? JSON.parse(JSON.stringify(initialValue))
            : initialValue,
        callbacks: new Set(),
      };
      this.watchedProperties.set(propertyPath, watchedInfo);
    }
    watchedInfo.callbacks.add(callback);
  }

  /**
   * Removes a watch callback for a specific property path.
   * @param propertyPath The property path.
   * @param callback The callback function to remove.
   */
  removeWatch(propertyPath: string, callback: StatPropertyWatchCallback): void {
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
   * Retrieves detailed information for a specific tool number.
   * This is a direct call to the native addon.
   * @param toolNumber The tool number to query.
   * @returns A Promise that resolves with the tool data.
   */
  async toolInfo(toolNumber: number): Promise<ToolData> {
    if (!this.nativeInstance) {
      throw new Error("StatChannel native instance not available.");
    }
    // The native toolInfo might throw, so we let it propagate or catch here
    return this.nativeInstance.toolInfo(toolNumber);
  }

  /**
   * Cleans up resources, stopping the polling timer.
   */
  destroy(): void {
    this.stopPolling();
    this.watchedProperties.clear();
    this.fullChangeCallbacks.clear();
    // If the nativeInstance had a disconnect method, call it here
  }

  // --- Convenience Getters for common properties ---
  // These access the locally cached `this.currentStat`

  get echoSerialNumber(): number | undefined {
    return this.currentStat?.echoSerialNumber;
  }
  get overallState(): RcsStatus | undefined {
    return this.currentStat?.state;
  }

  get task(): LinuxCNCStat["task"] | undefined {
    return this.currentStat?.task;
  }
  get motion(): LinuxCNCStat["motion"] | undefined {
    return this.currentStat?.motion;
  }
  get io(): LinuxCNCStat["io"] | undefined {
    return this.currentStat?.io;
  }
  get debugFlags(): number | undefined {
    return this.currentStat?.debug;
  }

  get homed(): boolean[] | undefined {
    return this.currentStat?.homed;
  }
  get limit(): number[] | undefined {
    return this.currentStat?.limit;
  }
  get toolTable(): ToolEntry[] | undefined {
    return this.currentStat?.toolTable;
  }

  // Example specific getters (can add many more based on common usage)
  get taskMode(): TaskMode | undefined {
    return this.currentStat?.task.mode;
  }
  get taskState(): TaskState | undefined {
    return this.currentStat?.task.state;
  }
  get currentLine(): number | undefined {
    return this.currentStat?.task.currentLine;
  }
  get motionLine(): number | undefined {
    return this.currentStat?.task.motionLine;
  }
  get file(): string | undefined {
    return this.currentStat?.task.file;
  }
  get actualPosition(): EmcPose | undefined {
    return this.currentStat?.motion.traj.actualPosition;
  }
  get toolInSpindle(): number | undefined {
    return this.currentStat?.io.tool.toolInSpindle;
  }
  get feedRateOverride(): number | undefined {
    return this.currentStat?.motion.traj.feedrateOverride;
  }
  get spindleSpeedOverride(): number | undefined {
    return this.currentStat?.motion.spindle[0]?.override;
  } // Assuming spindle 0
  get currentVelocity(): number | undefined {
    return this.currentStat?.motion.traj.currentVel;
  }
  get distanceToGo(): number | undefined {
    return this.currentStat?.motion.traj.distanceToGo;
  }
  get isEstop(): boolean | undefined {
    return this.currentStat?.task.state === TaskState.ESTOP;
  }
  get isMachineOn(): boolean | undefined {
    return this.currentStat?.task.state === TaskState.ON;
  }
  get isIdle(): boolean | undefined {
    return this.currentStat?.task.interpState === InterpState.IDLE;
  }
}
