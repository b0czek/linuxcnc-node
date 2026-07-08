/**
 * Position Logger Protocol Definition
 *
 * Defines the typed contract for machine position logging and streaming.
 * Used for toolpath visualization and motion history.
 */

import type { ChannelProtocol } from "@edenapp/types";
import type { PositionLoggerIndex } from "@linuxcnc-node/types";

// ============================================================================
// Types (re-export for convenience)
// ============================================================================

export type { PositionLoggerIndex };

// Note: POSITION_STRIDE constant should be imported directly from @linuxcnc-node/types

// ============================================================================
// Protocol Definition
// ============================================================================

/**
 * Protocol for position logging over AppBus.
 *
 * Tracks machine tool path over time. All positions are returned as Float64Array
 * with 10 elements per point: [x, y, z, a, b, c, u, v, w, motionType]
 *
 * Use PositionLoggerIndex enum and POSITION_STRIDE constant for array access.
 */
export interface PositionLoggerProtocol extends ChannelProtocol {
  hostMessages: {
    /**
     * Delta position update (pushed at configured interval)
     * Contains only NEW points since the last update for this connection.
     */
    "position-update": {
      /** New points since last update (Float64Array with POSITION_STRIDE per point) */
      points: Float64Array;
      /** Number of new points in this update */
      count: number;
      /** Server-side cursor after this update (monotonic, for sync verification) */
      cursor: number;
    };

    /** Backend error */
    error: {
      code: string;
      message: string;
    };
  };

  peerMessages: {};

  hostHandles: {
    /**
     * Start position logging
     * @param interval - Logging interval in seconds (default: 0.01)
     * @param maxHistory - Maximum number of points to keep in history (default: 10000)
     */
    start: {
      args: { interval?: number; maxHistory?: number };
      result: { success: boolean; cursor: number };
    };

    /** Stop position logging */
    stop: {
      args: {};
      result: { success: boolean };
    };

    /** Clear the position history (invalidates all previous cursors) */
    clear: {
      args: {};
      result: { success: boolean };
    };

    /**
     * Get full position history.
     * @returns Complete history as Float64Array plus point count and cursor
     */
    sync: {
      args: {};
      result: {
        /** Full position history */
        history: Float64Array;
        /** Number of points in history */
        count: number;
        /** Current cursor for delta updates */
        cursor: number;
      };
    };

    /**
     * Get the current position as a Float64Array
     * Layout: [x, y, z, a, b, c, u, v, w, motionType]
     * @returns Float64Array with 10 values, or null if no position available
     */
    "get-current": {
      args: {};
      result: { position: Float64Array | null };
    };

    /** Get current cursor position without any data */
    "get-cursor": {
      args: {};
      result: { cursor: number };
    };

    /** Health check */
    ping: {
      args: {};
      result: { timestamp: number };
    };
  };

  peerHandles: {};
}
