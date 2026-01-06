import { EventEmitter } from "node:events";
import {
  StatChannel,
  DEFAULT_STAT_POLL_INTERVAL,
} from "../../src/ts/statChannel";
import { LinuxCNCStat, PositionIndex } from "@linuxcnc/types";
import { addon } from "../../src/ts/constants";

// Mock the native addon
jest.mock("../../src/ts/constants", () => ({
  addon: {
    NativeStatChannel: jest.fn(),
  },
}));

describe("StatChannel", () => {
  let mockNativeInstance: any;
  let mockStat: LinuxCNCStat;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create a mock stat object
    mockStat = {
      task: {
        motionLine: 10,
      },
      motion: {
        traj: {
          position: new Float64Array(9),
        },
      },
    } as any;

    // Create mock native instance
    mockNativeInstance = {
      getCurrentFullStat: jest.fn().mockReturnValue(mockStat),
      poll: jest.fn().mockReturnValue(true),
      disconnect: jest.fn(),
    };

    (addon.NativeStatChannel as jest.Mock).mockImplementation(
      () => mockNativeInstance
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("setPollInterval()", () => {
    it("should enforce minimum interval of 10ms", () => {
      const statChannel = new StatChannel();

      statChannel.setPollInterval(5);
      expect(statChannel.getPollInterval()).toBe(10);

      statChannel.setPollInterval(1);
      expect(statChannel.getPollInterval()).toBe(10);

      statChannel.setPollInterval(10);
      expect(statChannel.getPollInterval()).toBe(10);

      statChannel.setPollInterval(100);
      expect(statChannel.getPollInterval()).toBe(100);

      statChannel.destroy();
    });
  });

  describe("on()", () => {
    it("should trigger callback only when watched property changes", () => {
      const statChannel = new StatChannel();
      const callback = jest.fn();

      statChannel.on("task.motionLine", callback);

      // Update the stat
      const updatedStat = {
        ...mockStat,
        task: { ...mockStat.task, motionLine: 20 },
      };
      mockNativeInstance.getCurrentFullStat.mockReturnValue(updatedStat);

      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      expect(callback).toHaveBeenCalledWith(20, 10, "task.motionLine");

      statChannel.destroy();
    });

    it("should not trigger callback when watched property does not change", () => {
      const statChannel = new StatChannel();
      const callback = jest.fn();

      statChannel.on("task.motionLine", callback);

      // Advance timer without changing the stat
      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      expect(callback).not.toHaveBeenCalled();

      statChannel.destroy();
    });

    it("should handle object value changes with deep comparison", () => {
      const statChannel = new StatChannel();
      const callback = jest.fn();

      statChannel.on("motion.traj.position", callback);

      // Update the stat
      const newPosition = new Float64Array(9);
      const { X, Y } = PositionIndex;
      newPosition[X] = 10;
      newPosition[Y] = 20;

      const updatedStat = {
        ...mockStat,
        motion: {
          ...mockStat.motion,
          traj: {
            ...mockStat.motion.traj,
            position: newPosition,
          },
        },
      };
      mockNativeInstance.getCurrentFullStat.mockReturnValue(updatedStat);

      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toEqual(newPosition);

      statChannel.destroy();
    });

    it("should handle errors thrown by callbacks without affecting others", () => {
      const statChannel = new StatChannel();
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error("Callback error");
      });
      const goodCallback = jest.fn();
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      statChannel.on("task.motionLine", errorCallback);
      statChannel.on("task.motionLine", goodCallback);

      // Update the stat
      const updatedStat = {
        ...mockStat,
        task: { ...mockStat.task, motionLine: 20 },
      };
      mockNativeInstance.getCurrentFullStat.mockReturnValue(updatedStat);

      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
      statChannel.destroy();
    });

    it("should support method chaining", () => {
      const statChannel = new StatChannel();
      const callback = jest.fn();

      const result = statChannel.on("task.motionLine", callback);
      expect(result).toBe(statChannel);

      statChannel.destroy();
    });
  });

  describe("once()", () => {
    it("should remove callback after first call", () => {
      const statChannel = new StatChannel();
      const callback = jest.fn();

      statChannel.once("task.motionLine", callback);

      // Update the stat
      const updatedStat = {
        ...mockStat,
        task: { ...mockStat.task, motionLine: 20 },
      };
      mockNativeInstance.getCurrentFullStat.mockReturnValue(updatedStat);

      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      expect(callback).toHaveBeenCalledTimes(1);

      // Update again
      const updatedStat2 = {
        ...mockStat,
        task: { ...mockStat.task, motionLine: 30 },
      };
      mockNativeInstance.getCurrentFullStat.mockReturnValue(updatedStat2);

      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      // Should still be called only once
      expect(callback).toHaveBeenCalledTimes(1);

      statChannel.destroy();
    });

    it("should support method chaining", () => {
      const statChannel = new StatChannel();
      const callback = jest.fn();

      const result = statChannel.once("task.motionLine", callback);
      expect(result).toBe(statChannel);

      statChannel.destroy();
    });
  });

  describe("off()", () => {
    it("should remove a specific callback and not trigger it", () => {
      const statChannel = new StatChannel();
      const callback = jest.fn();

      statChannel.on("task.motionLine", callback);
      statChannel.off("task.motionLine", callback);

      // Update the stat
      const updatedStat = {
        ...mockStat,
        task: { ...mockStat.task, motionLine: 20 },
      };
      mockNativeInstance.getCurrentFullStat.mockReturnValue(updatedStat);

      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      expect(callback).not.toHaveBeenCalled();

      statChannel.destroy();
    });

    it("should not affect other callbacks on the same property", () => {
      const statChannel = new StatChannel();
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      statChannel.on("task.motionLine", callback1);
      statChannel.on("task.motionLine", callback2);
      statChannel.off("task.motionLine", callback1);

      // Update the stat
      const updatedStat = {
        ...mockStat,
        task: { ...mockStat.task, motionLine: 20 },
      };
      mockNativeInstance.getCurrentFullStat.mockReturnValue(updatedStat);

      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith(20, 10, "task.motionLine");

      statChannel.destroy();
    });

    it("should support method chaining", () => {
      const statChannel = new StatChannel();
      const callback = jest.fn();

      statChannel.on("task.motionLine", callback);
      const result = statChannel.off("task.motionLine", callback);
      expect(result).toBe(statChannel);

      statChannel.destroy();
    });
  });

  describe("removeListener()", () => {
    it("should be an alias for off()", () => {
      const statChannel = new StatChannel();
      const callback = jest.fn();

      statChannel.on("task.motionLine", callback);
      statChannel.removeListener("task.motionLine", callback);

      // Update the stat
      const updatedStat = {
        ...mockStat,
        task: { ...mockStat.task, motionLine: 20 },
      };
      mockNativeInstance.getCurrentFullStat.mockReturnValue(updatedStat);

      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      expect(callback).not.toHaveBeenCalled();

      statChannel.destroy();
    });
  });

  describe("polling behavior", () => {
    it("should handle errors during polling and continue", () => {
      const statChannel = new StatChannel();
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      mockNativeInstance.poll.mockImplementationOnce(() => {
        throw new Error("Poll error");
      });

      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      expect(consoleErrorSpy).toHaveBeenCalled();

      // Should continue polling after error
      mockNativeInstance.poll.mockReturnValue(true);
      jest.advanceTimersByTime(DEFAULT_STAT_POLL_INTERVAL);

      expect(mockNativeInstance.poll).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
      statChannel.destroy();
    });
  });
});
