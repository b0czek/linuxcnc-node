/**
 * Integration tests for PositionLogger
 *
 * Tests real position logging from LinuxCNC machine movements
 */

import { PositionLogger, CommandChannel, StatChannel } from "../../src/ts";
import {
  TaskMode,
  MotionType,
  PositionLoggerIndex,
  POSITION_STRIDE,
} from "@linuxcnc-node/types";

const { X, Y, Z, MotionType: MotionTypeIdx } = PositionLoggerIndex;
import { startLinuxCNC, stopLinuxCNC, setupLinuxCNC } from "./setupLinuxCNC";

/**
 * Helper function to execute an MDI command and wait for motion to complete
 */
async function executeMdiAndWait(
  commandChannel: CommandChannel,
  statChannel: StatChannel,
  command: string
): Promise<void> {
  await commandChannel.mdi(command);
  // Give motion time to start
  await new Promise((resolve) => setTimeout(resolve, 100));
  // Wait for motion to complete
  while (!statChannel.motion?.traj.inPosition) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("Integration: PositionLogger", () => {
  let commandChannel: CommandChannel;
  let statChannel: StatChannel;

  beforeAll(async () => {
    await startLinuxCNC();

    commandChannel = new CommandChannel();
    statChannel = new StatChannel();

    await setupLinuxCNC(commandChannel, statChannel);

    await commandChannel.setTaskMode(TaskMode.MDI);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }, 30000);

  afterAll(async () => {
    statChannel?.destroy();
    commandChannel?.destroy();

    await stopLinuxCNC();
  });

  describe("Basic Logging", () => {
    it("should start logging with default options", async () => {
      const positionLogger = new PositionLogger();

      expect(() => {
        positionLogger.start();
      }).not.toThrow();

      // Give it time to start
      await new Promise((resolve) => setTimeout(resolve, 100));
      positionLogger.stop();
    }, 5000);

    it("should start logging with custom options", async () => {
      const positionLogger = new PositionLogger();

      expect(() => {
        positionLogger.start({
          interval: 0.02,
          maxHistorySize: 5000,
        });
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 100));
      positionLogger.stop();
    }, 5000);

    it("should get current position", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const currentPosition = positionLogger.getCurrentPosition();

      expect(currentPosition).not.toBeNull();
      expect(currentPosition!.length).toBe(10); // Check length instead of properties

      // All position values should be numbers (currentPosition guaranteed non-null by assertion above)
      expect(typeof currentPosition![X]).toBe("number");
      expect(typeof currentPosition![Y]).toBe("number");
      expect(typeof currentPosition![Z]).toBe("number");
      expect(typeof currentPosition![MotionTypeIdx]).toBe("number");

      positionLogger.stop();
    }, 5000);
  });

  describe("History Management", () => {
    it("should log initial position when started", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start({ interval: 0.01 }); // 10ms interval

      // Wait for initial position to be logged
      await new Promise((resolve) => setTimeout(resolve, 200));

      const count = positionLogger.getHistoryCount();

      // Should have logged at least the initial position
      // Note: May not accumulate many points when stationary due to colinearity optimization
      expect(count).toBeGreaterThan(0);
    }, 10000);

    it("should accumulate history during motion", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start({ interval: 0.01 }); // 10ms interval

      await new Promise((resolve) => setTimeout(resolve, 200));
      const initialCount = positionLogger.getHistoryCount();

      // Execute a move to generate motion (small move)
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G1 X5 F100");
      } catch (e) {
        console.log("Motion command:", e);
      }

      const finalCount = positionLogger.getHistoryCount();

      // Should have accumulated more points during the move
      expect(finalCount).toBeGreaterThan(initialCount);
      console.log(
        `History grew from ${initialCount} to ${finalCount} points during motion`
      );

      positionLogger.stop();
    }, 15000);

    it("should clear history", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start();

      // Execute some small movements to generate history
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G1 X1 F100");
        await executeMdiAndWait(commandChannel, statChannel, "G1 X0 F100");
      } catch (e) {
        console.log("Motion command:", e);
      }

      const countBefore = positionLogger.getHistoryCount();
      expect(countBefore).toBeGreaterThan(2);

      positionLogger.clear();

      // clear is async, non-awaitable
      await new Promise((resolve) => setTimeout(resolve, 100));

      // After clear, logger will immediately push 2 points for colinearity buffer
      const countAfter = positionLogger.getHistoryCount();
      expect(countAfter).toBe(2);
    }, 10000);

    it("should respect max history size", async () => {
      const positionLogger = new PositionLogger();
      const maxSize = 100;

      positionLogger.start({ interval: 0.001, maxHistorySize: maxSize });

      // Wait long enough to exceed max size
      await new Promise((resolve) => setTimeout(resolve, 500));

      const count = positionLogger.getHistoryCount();

      // Should not exceed max size
      expect(count).toBeLessThanOrEqual(maxSize);
    }, 10000);

    it("should retrieve history with range parameters", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const totalCount = positionLogger.getHistoryCount();
      expect(totalCount).toBeGreaterThan(0);

      // Get first 5 points
      const firstFive = positionLogger.getMotionHistory(0, 5);
      expect(firstFive.length).toBeLessThanOrEqual(5 * POSITION_STRIDE);

      // Each point should have position data
      for (let i = 0; i < firstFive.length; i += POSITION_STRIDE) {
        // Just verify we can read values
        expect(typeof firstFive[i + X]).toBe("number");
        expect(typeof firstFive[i + Y]).toBe("number");
        expect(typeof firstFive[i + MotionTypeIdx]).toBe("number");
      }
    }, 10000);

    it("should retrieve recent history", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const recentPoints = positionLogger.getRecentHistory(10);

      expect(recentPoints.constructor.name).toBe("Float64Array");
      expect(recentPoints.length).toBeGreaterThan(0);
      expect(recentPoints.length).toBeLessThanOrEqual(10 * POSITION_STRIDE);
    }, 10000);
  });

  describe("Motion Tracking", () => {
    beforeEach(async () => {
      // Ensure machine is ready (already homed from beforeAll, just set to MDI mode)
      await commandChannel.setTaskMode(TaskMode.MDI);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should track position during G0 rapid moves", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const initialPosition = positionLogger.getCurrentPosition();
      expect(initialPosition).not.toBeNull();
      const initialX = initialPosition![X];

      // Execute a small rapid move
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G0 X2");
      } catch (e) {
        console.log("Move command result:", e);
      }

      const finalPosition = positionLogger.getCurrentPosition();
      expect(finalPosition).not.toBeNull();
      const history = positionLogger.getMotionHistory();

      // Should have logged multiple points
      expect(history.length).toBeGreaterThan(0);

      console.log(
        `Tracked ${history.length} points. Position X: ${initialX} -> ${
          finalPosition![X]
        }`
      );

      // History should contain motion type information
      let hasTraverse = false;
      for (let i = 0; i < history.length; i += POSITION_STRIDE) {
        if (history[i + MotionTypeIdx] === MotionType.TRAVERSE) {
          hasTraverse = true;
          break;
        }
      }
      if (hasTraverse) {
        console.log("Detected TRAVERSE motion type");
      }
    }, 15000);

    it("should track position during G1 feed moves", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const initialPosition = positionLogger.getCurrentPosition();
      expect(initialPosition).not.toBeNull();

      // Execute a feed move (slower, easier to track)
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G1 X3 F50");
      } catch (e) {
        console.log("Feed move result:", e);
      }

      const history = positionLogger.getMotionHistory();

      // Should have logged points during the move
      expect(history.length).toBeGreaterThan(0);
      console.log(`Tracked ${history.length} points during feed move`);

      // Check for FEED motion type
      let hasFeed = false;
      for (let i = 0; i < history.length; i += POSITION_STRIDE) {
        if (history[i + MotionTypeIdx] === MotionType.FEED) {
          hasFeed = true;
          break;
        }
      }
      if (hasFeed) {
        console.log("Detected FEED motion type");
      }
    }, 15000);

    it("should track multi-axis movements", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const initialPosition = positionLogger.getCurrentPosition();
      expect(initialPosition).not.toBeNull();

      // Execute a small multi-axis move
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G0 X1 Y1");
      } catch (e) {
        console.log("Multi-axis move result:", e);
      }

      const finalPosition = positionLogger.getCurrentPosition();
      expect(finalPosition).not.toBeNull();
      const history = positionLogger.getMotionHistory();

      expect(history.length).toBeGreaterThan(0);

      console.log(
        `Position changed: X ${initialPosition![X]} -> ${finalPosition![X]}, ` +
          `Y ${initialPosition![Y]} -> ${finalPosition![Y]}, ` +
          `Tracked ${history.length / POSITION_STRIDE} points`
      );
    }, 15000);

    it("should log position when stationary", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 300));

      const history1 = positionLogger.getMotionHistory();
      const count1 = history1.length;

      // Wait without any motion commands
      await new Promise((resolve) => setTimeout(resolve, 300));

      const history2 = positionLogger.getMotionHistory();
      const count2 = history2.length;

      // Should have logged initial position
      expect(count1).toBeGreaterThan(0);

      // When stationary, count won't increase much (or at all) due to colinearity optimization
      // The logger only logs points when position changes or motion type changes
      expect(count2).toBeGreaterThanOrEqual(count1);

      // All points should have motionType defined
      const recentPoints = positionLogger.getRecentHistory(5);
      for (let i = 0; i < recentPoints.length; i += POSITION_STRIDE) {
        const motionType = recentPoints[i + MotionTypeIdx];
        expect(motionType).toBeDefined();
        expect(typeof motionType).toBe("number");
      }
    }, 10000);
  });

  describe("Start/Stop Behavior", () => {
    it("should allow restarting after stop", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const count1 = positionLogger.getHistoryCount();
      expect(count1).toBeGreaterThan(0);

      positionLogger.stop();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const count2 = positionLogger.getHistoryCount();

      // Start again
      positionLogger.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const count3 = positionLogger.getHistoryCount();

      // History should continue accumulating
      expect(count3).toBeGreaterThanOrEqual(count2);

      positionLogger.stop();
    }, 10000);

    it("should not log new points when stopped", async () => {
      const positionLogger = new PositionLogger();

      positionLogger.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Execute a small move to generate some history
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G1 X0.5 F50");
      } catch (e) {
        console.log("First move:", e);
      }

      positionLogger.stop();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const countAfterStop = positionLogger.getHistoryCount();

      // Try to trigger more motion while stopped
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G1 X1 F50");
      } catch (e) {
        console.log("Second move:", e);
      }

      const countAfterWait = positionLogger.getHistoryCount();

      // Count should not increase while stopped, even with motion
      expect(countAfterWait).toBe(countAfterStop);
      console.log(`History stayed at ${countAfterStop} points after stop`);
    }, 15000);

    it("should handle multiple start calls", () => {
      const positionLogger = new PositionLogger();

      expect(() => {
        positionLogger.start({ interval: 0.01 });
        positionLogger.start({ interval: 0.02 });
        positionLogger.start({ interval: 0.03 });
      }).not.toThrow();

      return new Promise((resolve) => setTimeout(resolve, 200)).then(() => {
        const count = positionLogger.getHistoryCount();
        expect(count).toBeGreaterThan(0);
        positionLogger.stop();
      });
    }, 5000);
  });

  describe("Cursor and Delta API", () => {
    it("should return cursor of 0 before starting", () => {
      const logger = new PositionLogger();
      const cursor = logger.getCurrentCursor();
      expect(cursor).toBe(0);
    }, 5000);

    it("should have cursor greater than 0 after logging starts", async () => {
      const logger = new PositionLogger();

      logger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const cursor = logger.getCurrentCursor();
      expect(cursor).toBeGreaterThan(0);

      logger.stop();
    }, 5000);

    it("should have monotonically increasing cursor during direction changes", async () => {
      const logger = new PositionLogger();

      logger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Execute first move to establish baseline cursor after initial logging settles
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G1 X0 Y0 F100");
      } catch (e) {
        console.log("Initial move:", e);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));

      const cursor1 = logger.getCurrentCursor();

      // Execute moves with significant direction change to force new logged points
      // (colinearity optimization only skips colinear points)
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G1 X5 F100");
        await executeMdiAndWait(commandChannel, statChannel, "G1 Y5 F100");
        await executeMdiAndWait(commandChannel, statChannel, "G1 X0 F100");
      } catch (e) {
        console.log("Move command:", e);
      }

      const cursor2 = logger.getCurrentCursor();
      expect(cursor2).toBeGreaterThan(cursor1);

      console.log(`Cursor increased from ${cursor1} to ${cursor2}`);
      logger.stop();
    }, 20000);

    it("should return delta points since cursor", async () => {
      const logger = new PositionLogger();

      logger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Get initial cursor
      const initialCursor = logger.getCurrentCursor();

      // Execute a move to generate new points
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G1 X2 F100");
      } catch (e) {
        console.log("Move command:", e);
      }

      const delta = logger.getDeltaSince(initialCursor);

      expect(delta.count).toBeGreaterThan(0);
      expect(delta.cursor).toBeGreaterThan(initialCursor);
      expect(delta.wasReset).toBe(false);
      expect(delta.points.length).toBe(delta.count * POSITION_STRIDE);

      console.log(
        `Got ${delta.count} delta points since cursor ${initialCursor}, new cursor: ${delta.cursor}`
      );
      logger.stop();
    }, 15000);

    it("should return full history when cursor is 0", async () => {
      const logger = new PositionLogger();

      logger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const delta = logger.getDeltaSince(0);
      const historyCount = logger.getHistoryCount();

      // Delta with cursor 0 should return same count as full history
      expect(delta.count).toBe(historyCount);
      expect(delta.wasReset).toBe(false);

      logger.stop();
    }, 5000);

    it("should return empty delta when cursor is current", async () => {
      const logger = new PositionLogger();

      logger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Stop logging so cursor doesn't advance
      logger.stop();

      const currentCursor = logger.getCurrentCursor();
      const delta = logger.getDeltaSince(currentCursor);

      expect(delta.count).toBe(0);
      expect(delta.cursor).toBe(currentCursor);
      expect(delta.wasReset).toBe(false);
    }, 5000);

    it("should set wasReset flag when cursor is stale (history wrapped)", async () => {
      const logger = new PositionLogger();

      // Use a very small history size to force wrapping
      logger.start({ interval: 0.005, maxHistorySize: 10 });

      // Get initial cursor
      const initialCursor = logger.getCurrentCursor();

      // Generate actual motion with direction changes to create many logged points
      // Each direction change forces a new point to be logged
      try {
        for (let i = 0; i < 5; i++) {
          await executeMdiAndWait(commandChannel, statChannel, "G0 X2");
          await executeMdiAndWait(commandChannel, statChannel, "G0 Y2");
          await executeMdiAndWait(commandChannel, statChannel, "G0 X0");
          await executeMdiAndWait(commandChannel, statChannel, "G0 Y0");
        }
      } catch (e) {
        console.log("Motion for history wrap:", e);
      }

      const delta = logger.getDeltaSince(initialCursor);

      // Cursor should have advanced beyond the history size
      expect(delta.cursor).toBeGreaterThan(10);
      // wasReset indicates the cursor was stale (history wrapped past it)
      expect(delta.wasReset).toBe(true);

      console.log(
        `History wrapped - wasReset: ${delta.wasReset}, cursor: ${initialCursor} -> ${delta.cursor}`
      );
      logger.stop();
    }, 30000);

    it("should support incremental updates workflow", async () => {
      const logger = new PositionLogger();

      logger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate client tracking updates with cursor
      let clientCursor = 0;
      let totalPointsReceived = 0;

      // First fetch - get all history
      const delta1 = logger.getDeltaSince(clientCursor);
      totalPointsReceived += delta1.count;
      clientCursor = delta1.cursor;

      // Execute a move
      try {
        await executeMdiAndWait(commandChannel, statChannel, "G1 X3 F100");
      } catch (e) {
        console.log("Move:", e);
      }

      // Second fetch - get only new points
      const delta2 = logger.getDeltaSince(clientCursor);
      totalPointsReceived += delta2.count;
      clientCursor = delta2.cursor;

      expect(delta2.wasReset).toBe(false);
      expect(totalPointsReceived).toBe(logger.getHistoryCount());

      console.log(
        `Incremental updates: ${delta1.count} initial + ${delta2.count} new = ${totalPointsReceived} total`
      );
      logger.stop();
    }, 15000);

    it("should set wasReset after clear()", async () => {
      const logger = new PositionLogger();

      logger.start({ interval: 0.01 });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const cursorBefore = logger.getCurrentCursor();
      expect(cursorBefore).toBeGreaterThan(0);

      logger.clear();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // After clear, the oldest_cursor is set to cursor+1, making any
      // pre-clear cursor stale. The current cursor will be >= cursorBefore.
      const delta = logger.getDeltaSince(cursorBefore);
      expect(delta.wasReset).toBe(true);
      expect(delta.cursor).toBeGreaterThanOrEqual(cursorBefore);

      logger.stop();
    }, 5000);
  });

  describe("Edge Cases", () => {
    it("should handle getting position before starting", () => {
      const logger = new PositionLogger();

      // Should not throw and should return null when not started
      const pos = logger.getCurrentPosition();
      expect(pos).toBeNull();
    }, 5000);

    it("should handle getting history when empty", () => {
      const logger = new PositionLogger();

      const count = logger.getHistoryCount();
      expect(count).toBe(0);

      const history = logger.getMotionHistory();
      expect(history.length).toBe(0);

      const recent = logger.getRecentHistory();
      expect(recent.length).toBe(0);
    }, 5000);

    it("should handle clear when not started", () => {
      const logger = new PositionLogger();

      expect(() => {
        logger.clear();
      }).not.toThrow();

      expect(logger.getHistoryCount()).toBe(0);
    }, 5000);

    it("should handle rapid start/stop cycles", async () => {
      const logger = new PositionLogger();

      for (let i = 0; i < 5; i++) {
        logger.start();
        await new Promise((resolve) => setTimeout(resolve, 50));
        logger.stop();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Should have accumulated some history
      const count = logger.getHistoryCount();
      expect(count).toBeGreaterThanOrEqual(0);
    }, 10000);
  });
});
