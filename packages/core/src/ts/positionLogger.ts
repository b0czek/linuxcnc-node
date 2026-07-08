import { addon } from "./constants";

export interface PositionLoggerOptions {
  /** Logging interval in seconds (default: 0.01) */
  interval?: number;
  /** Maximum number of points to keep in history (default: 10000) */
  maxHistorySize?: number;
}

export interface DeltaResult {
  /** Points since the requested cursor */
  points: Float64Array;
  /** Number of points returned */
  count: number;
  /** Current server cursor */
  cursor: number;
  /** True if requested cursor was stale (history wrapped), client should reset */
  wasReset: boolean;
}

/**
 * Position Logger for tracking machine tool path
 *
 * This class provides functionality to log the position of a LinuxCNC machine tool
 * over time. All positions are returned as Float64Array with 10 elements per point:
 * [x, y, z, a, b, c, u, v, w, motionType]
 *
 * Use PositionLoggerIndex enum (or destructure it for shorter access like data[X]) and POSITION_STRIDE constant for array access.
 */
export class PositionLogger {
  private nativeLogger: any;

  constructor() {
    this.nativeLogger = new addon.NativePositionLogger();
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
   * Clear the position history (invalidates all previous cursors)
   */
  clear(): void {
    this.nativeLogger.clear();
  }

  /**
   * Get the current position as a Float64Array
   * Layout: [x, y, z, a, b, c, u, v, w, motionType]
   * @returns Float64Array with 10 values, or null if no position available
   */
  getCurrentPosition(): Float64Array | null {
    return this.nativeLogger.getCurrentPosition();
  }

  /**
   * Get the motion history as a Float64Array
   * Layout: [x, y, z, a, b, c, u, v, w, motionType] repeated for each point
   * Use POSITION_STRIDE (10) to iterate through points
   * @param startIndex Starting index (default: 0)
   * @param count Number of points to retrieve (default: all)
   * @returns Float64Array with 10 values per point
   */
  getMotionHistory(startIndex?: number, count?: number): Float64Array {
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
   * @returns Float64Array with 10 values per point
   */
  getRecentHistory(count: number = 10): Float64Array {
    const totalCount = this.getHistoryCount();
    if (totalCount === 0) return new Float64Array(0);

    const startIndex = Math.max(0, totalCount - count);
    const actualCount = Math.min(count, totalCount);

    return this.getMotionHistory(startIndex, actualCount);
  }

  /**
   * Get the current cursor position (monotonic counter of points ever added)
   * @returns Current cursor value
   */
  getCurrentCursor(): number {
    return this.nativeLogger.getCurrentCursor();
  }

  /**
   * Get delta points since a given cursor position
   * Use this for efficient incremental updates instead of fetching full history.
   * @param cursor Last known cursor (0 for full history)
   * @returns Delta result with points, count, new cursor, and wasReset flag
   */
  getDeltaSince(cursor: number): DeltaResult {
    return this.nativeLogger.getDeltaSince(cursor);
  }
}
