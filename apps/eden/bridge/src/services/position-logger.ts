/**
 * Position Logger Service
 *
 * Exposes machine position logging and history streaming via AppBus.
 * Implements PositionLoggerProtocol from @linuxcnc-node/eden-protocol.
 */

import { PositionLogger } from "@linuxcnc-node/core";
import { POSITION_STRIDE } from "@linuxcnc-node/types";
import type { PositionLoggerProtocol } from "@linuxcnc-node/eden-protocol";
import type { HostConnection } from "@edenapp/types";

const SERVICE_NAME = "position-logger";
const UPDATE_INTERVAL_MS = 50;

// Shared position logger instance
let logger: PositionLogger | null = null;

// Cursor tracking
let cursor = 0;
let lastHistoryCount = 0;

// Connected clients
const connections = new Map<string, HostConnection<PositionLoggerProtocol>>();

// Update interval for pushing position updates
let updateInterval: NodeJS.Timeout | null = null;

/**
 * Start the update loop for pushing position deltas to clients
 */
function startUpdateLoop(): void {
  if (updateInterval) return;

  updateInterval = setInterval(() => {
    if (!logger || connections.size === 0) return;

    const currentCount = logger.getHistoryCount();
    if (currentCount <= lastHistoryCount) return;

    // Get new points since last update
    const newPointCount = currentCount - lastHistoryCount;
    const newPoints = logger.getMotionHistory(lastHistoryCount, newPointCount);

    cursor++;
    lastHistoryCount = currentCount;

    // Push to all connected clients - cast to any to handle type conflicts
    const message = {
      points: newPoints,
      count: newPointCount,
      cursor,
    };

    for (const conn of connections.values()) {
      try {
        conn.send("position-update", message);
      } catch (err) {
        console.error("[PositionLogger] Error sending update:", err);
      }
    }
  }, UPDATE_INTERVAL_MS);
}

/**
 * Stop the update loop
 */
function stopUpdateLoop(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

/**
 * Initialize the Position Logger service
 */
export function initPositionLoggerService(): void {
  // Create shared logger instance
  logger = new PositionLogger();

  worker!.appBus.exposeService(
    SERVICE_NAME,
    (connection, { appId: clientAppId }) => {
      console.log(`[PositionLogger] Client connected: ${clientAppId}`);

      const typedConn = connection as HostConnection<PositionLoggerProtocol>;
      connections.set(clientAppId, typedConn);

      // Handle disconnect
      connection.onClose(() => {
        console.log(`[PositionLogger] Client disconnected: ${clientAppId}`);
        connections.delete(clientAppId);

        // Stop update loop if no clients
        if (connections.size === 0) {
          stopUpdateLoop();
        }
      });

      // Start handler
      typedConn.handle("start", ({ interval, maxHistory }) => {
        if (!logger) {
          return { success: false, cursor: 0 };
        }

        logger.start({
          interval: interval ?? 0.01,
          maxHistorySize: maxHistory ?? 10000,
        });

        lastHistoryCount = 0;
        cursor++;

        // Start update loop if not running
        startUpdateLoop();

        return { success: true, cursor };
      });

      // Stop handler
      typedConn.handle("stop", () => {
        if (!logger) {
          return { success: false };
        }

        logger.stop();
        return { success: true };
      });

      // Clear handler
      typedConn.handle("clear", () => {
        if (!logger) {
          return { success: false };
        }

        logger.clear();
        lastHistoryCount = 0;
        cursor++;

        return { success: true };
      });

      typedConn.handle("sync", () => {
        if (!logger) {
          return {
            history: new Float64Array(0),
            count: 0,
            cursor: 0,
          };
        }

        const currentCount = logger.getHistoryCount();
        const history = logger.getMotionHistory(0, currentCount);

        return {
          history,
          count: history.length / POSITION_STRIDE,
          cursor,
        };
      });

      typedConn.handle("get-current", () => {
        if (!logger) {
          return { position: null };
        }

        const position = logger.getCurrentPosition();
        return { position };
      });

      // Get cursor
      typedConn.handle("get-cursor", () => {
        return { cursor };
      });

      // Ping
      typedConn.handle("ping", () => {
        return { timestamp: Date.now() };
      });
    },
    { description: "Machine position logging and history streaming" }
  );

  console.log(`[PositionLogger] Service exposed as '${SERVICE_NAME}'`);
}
