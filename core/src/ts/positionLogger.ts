import { addon } from "./constants";
import { EmcPose, AvailableAxis } from "./types";

export interface PositionPoint extends EmcPose {
  motionType: number;
}

export interface PositionLoggerOptions {
  /** Logging interval in seconds (default: 0.01) */
  interval?: number;
  /** Maximum number of points to keep in history (default: 10000) */
  maxHistorySize?: number;
}

/** Stride for position data in Float64Array: x, y, z, a, b, c, u, v, w, motionType */
export const POSITION_STRIDE = 10;

/** Index constants for position data in Float64Array */
export enum PositionIndex {
  X = 0,
  Y = 1,
  Z = 2,
  A = 3,
  B = 4,
  C = 5,
  U = 6,
  V = 7,
  W = 8,
  MotionType = 9,
}

/**
 * Position Logger for tracking machine tool path
 *
 * This class provides functionality to log the position of a LinuxCNC machine tool
 * over time.
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
   * Clear the position history
   */
  clear(): void {
    this.nativeLogger.clear();
  }

  /**
   * Get the current position as a Float64Array
   * Layout: [x, y, z, a, b, c, u, v, w, motionType]
   * @returns Float64Array with 10 values, or null if no position available
   */
  getCurrentPositionRaw(): Float64Array | null {
    return this.nativeLogger.getCurrentPosition();
  }

  /**
   * Get the current position of the machine
   * @returns Current position with motion type, or null if no position available
   */
  getCurrentPosition(): PositionPoint | null {
    const raw = this.nativeLogger.getCurrentPosition();
    if (!raw) return null;
    return {
      x: raw[PositionIndex.X],
      y: raw[PositionIndex.Y],
      z: raw[PositionIndex.Z],
      a: raw[PositionIndex.A],
      b: raw[PositionIndex.B],
      c: raw[PositionIndex.C],
      u: raw[PositionIndex.U],
      v: raw[PositionIndex.V],
      w: raw[PositionIndex.W],
      motionType: raw[PositionIndex.MotionType],
    };
  }

  /**
   * Get the motion history as a raw Float64Array
   * Layout: [x, y, z, a, b, c, u, v, w, motionType] repeated for each point
   * Use POSITION_STRIDE (10) to iterate through points
   * @param startIndex Starting index (default: 0)
   * @param count Number of points to retrieve (default: all)
   * @returns Float64Array with 10 values per point
   */
  getMotionHistoryRaw(startIndex?: number, count?: number): Float64Array {
    if (startIndex !== undefined && count !== undefined) {
      return this.nativeLogger.getMotionHistory(startIndex, count);
    } else if (startIndex !== undefined) {
      return this.nativeLogger.getMotionHistory(startIndex);
    } else {
      return this.nativeLogger.getMotionHistory();
    }
  }

  /**
   * Get the motion history
   * @param startIndex Starting index (default: 0)
   * @param count Number of points to retrieve (default: all)
   * @returns Array of position points
   */
  getMotionHistory(startIndex?: number, count?: number): PositionPoint[] {
    const raw = this.getMotionHistoryRaw(startIndex, count);
    const points: PositionPoint[] = [];
    const numPoints = raw.length / POSITION_STRIDE;

    for (let i = 0; i < numPoints; i++) {
      const offset = i * POSITION_STRIDE;
      points.push({
        x: raw[offset + PositionIndex.X],
        y: raw[offset + PositionIndex.Y],
        z: raw[offset + PositionIndex.Z],
        a: raw[offset + PositionIndex.A],
        b: raw[offset + PositionIndex.B],
        c: raw[offset + PositionIndex.C],
        u: raw[offset + PositionIndex.U],
        v: raw[offset + PositionIndex.V],
        w: raw[offset + PositionIndex.W],
        motionType: raw[offset + PositionIndex.MotionType],
      });
    }

    return points;
  }

  /**
   * Get the number of points in the motion history
   * @returns Number of logged points
   */
  getHistoryCount(): number {
    return this.nativeLogger.getHistoryCount();
  }

  /**
   * Get the most recent points from the history as raw Float64Array
   * @param count Number of recent points to get (default: 10)
   * @returns Float64Array with 10 values per point
   */
  getRecentHistoryRaw(count: number = 10): Float64Array {
    const totalCount = this.getHistoryCount();
    if (totalCount === 0) return new Float64Array(0);

    const startIndex = Math.max(0, totalCount - count);
    const actualCount = Math.min(count, totalCount);

    return this.getMotionHistoryRaw(startIndex, actualCount);
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
}
