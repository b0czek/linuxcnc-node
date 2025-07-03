import { addon } from "./constants";
import { EmcPose, AvailableAxis } from "./types";

export interface PositionPoint extends EmcPose {
  motionType: number;
  timestamp?: number; // Only available in history
}

export interface PositionLoggerOptions {
  /** Logging interval in seconds (default: 0.01) */
  interval?: number;
  /** Maximum number of points to keep in history (default: 10000) */
  maxHistorySize?: number;
}

/**
 * Position Logger for tracking machine tool path
 *
 * This class provides functionality to log the position of a LinuxCNC machine tool
 * over time, respecting the configured machine geometry.
 */
export class PositionLogger {
  private nativeLogger: any;

  constructor() {
    this.nativeLogger = new addon.NativePositionLogger();
  }

  /**
   * Set the machine geometry to determine which axes should be logged
   * @param geometry Array of axis identifiers (e.g., ["X", "Y", "Z"], ["X", "Y", "Z", "A", "B", "C"])
   */
  setGeometry(geometry: AvailableAxis[]): void {
    // Convert array to string for the native implementation
    const geometryString = geometry.join("");
    this.nativeLogger.setGeometry(geometryString);
  }

  /**
   * Start position logging
   * @param options Logging options
   */
  start(options: PositionLoggerOptions = {}): void {
    const interval = options.interval || 0.01;
    const maxHistorySize = options.maxHistorySize || 10000;
    this.nativeLogger.start(interval, maxHistorySize);
  }

  /**
   * Stop position logging
   */
  stop(): void {
    this.nativeLogger.stop();
  }

  /**
   * Clear the position history
   */
  clear(): void {
    this.nativeLogger.clear();
  }

  /**
   * Get the current position of the machine
   * Inactive axes will always return 0
   * @returns Current position with motion type
   */
  getCurrentPosition(): PositionPoint {
    return this.nativeLogger.getCurrentPosition();
  }

  /**
   * Get the motion history
   * @param startIndex Starting index (default: 0)
   * @param count Number of points to retrieve (default: all)
   * @returns Array of position points with timestamps
   */
  getMotionHistory(startIndex?: number, count?: number): PositionPoint[] {
    if (startIndex !== undefined && count !== undefined) {
      return this.nativeLogger.getMotionHistory(startIndex, count);
    } else if (startIndex !== undefined) {
      return this.nativeLogger.getMotionHistory(startIndex);
    } else {
      return this.nativeLogger.getMotionHistory();
    }
  }

  /**
   * Get the number of points in the motion history
   * @returns Number of logged points
   */
  getHistoryCount(): number {
    return this.nativeLogger.getHistoryCount();
  }

  /**
   * Get the most recent points from the history
   * @param count Number of recent points to get (default: 10)
   * @returns Array of recent position points
   */
  getRecentHistory(count: number = 10): PositionPoint[] {
    const totalCount = this.getHistoryCount();
    if (totalCount === 0) return [];

    const startIndex = Math.max(0, totalCount - count);
    const actualCount = Math.min(count, totalCount);

    return this.getMotionHistory(startIndex, actualCount);
  }

  /**
   * Get the current machine geometry configuration
   * @returns Array of active axis identifiers
   */
  getGeometry(): AvailableAxis[] {
    const geometryString = this.nativeLogger.getGeometry();
    return geometryString.split("") as AvailableAxis[];
  }
}
