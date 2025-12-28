import { EventEmitter } from "node:events";
import {
  StatChannel,
  DEFAULT_STAT_POLL_INTERVAL,
} from "../../src/ts/statChannel";
import { LinuxCNCStat, LinuxCNCStatPaths } from "../../src/ts/types";
import { addon } from "../../src/ts/constants";

// Mock the native addon
jest.mock("../../src/ts/constants", () => ({
  addon: {
    NativeStatChannel: jest.fn(),
  },
  TaskMode: {},
  TaskState: {},
  ExecState: {},
  InterpState: {},
  TrajMode: {},
  MotionType: {},
  ProgramUnits: {},
  RcsStatus: {},
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
        mode: 1,
        state: 2,
        execState: 1,
        interpState: 1,
        callLevel: 0,
        motionLine: 10,
        currentLine: 10,
        readLine: 10,
        file: "test.ngc",
        command: "G0 X10",
        program_units: 1,
        interpreter_errcode: 0,
        task_paused: 0,
        delayLeft: 0,
        activeGCodes: [
          10, 170, 200, 210, 400, 490, 540, 610, 640, 690, 710, 800, 900, 910,
          940, 980,
        ],
        activeMCodes: [0, 50, 90, 480, 530],
        activeSettings: [0, 0, 0],
        heartbeat: 1234,
      },
      motion: {
        traj: {
          linearUnits: 1,
          angularUnits: 1,
          cycleTime: 0.001,
          axes: 3,
          axis_mask: 7,
          mode: 1,
          enabled: 1,
          inpos: 1,
          queue: 0,
          activeQueue: 0,
          queueFull: 0,
          id: 1,
          paused: 0,
          scale: 1.0,
          spindle_scale: 1.0,
          position: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0, u: 0, v: 0, w: 0 },
          actualPosition: {
            x: 0,
            y: 0,
            z: 0,
            a: 0,
            b: 0,
            c: 0,
            u: 0,
            v: 0,
            w: 0,
          },
          velocity: 0,
          acceleration: 0,
          maxVelocity: 100,
          maxAcceleration: 1000,
          probedPosition: {
            x: 0,
            y: 0,
            z: 0,
            a: 0,
            b: 0,
            c: 0,
            u: 0,
            v: 0,
            w: 0,
          },
          probe_tripped: 0,
          probing: 0,
          probeval: 0,
          kinematics_type: 1,
          motion_type: 0,
          distance_to_go: 0,
          dtg: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0, u: 0, v: 0, w: 0 },
          current_vel: 0,
          feed_override_enabled: 1,
          spindle_override_enabled: 1,
          adaptive_feed_enabled: 0,
          feed_hold_enabled: 0,
        },
        axis: [],
        joint: [
          {
            jointType: 1,
            units: 1,
            backlash: 0,
            minPositionLimit: -100,
            maxPositionLimit: 100,
            maxFerror: 1,
            minFerror: 0.1,
            ferrorCurrent: 0,
            ferrorHighMark: 0,
            output: 0,
            input: 0,
            velocity: 0,
            inpos: 1,
            homing: 0,
            homed: 1,
            fault: 0,
            enabled: 1,
            minSoftLimit: 0,
            maxSoftLimit: 0,
            minHardLimit: 0,
            maxHardLimit: 0,
            overrideLimits: 0,
          },
        ],
        spindle: [
          {
            speed: 0,
            css_maximum: 0,
            css_factor: 0,
            direction: 0,
            brake: 1,
            increasing: 0,
            enabled: 0,
            orient_state: 0,
            orient_fault: 0,
            homed: 0,
            spindle_scale: 1.0,
            spindle_override_enabled: 1,
          },
        ],
      },
      io: {
        tool: {
          pocketPrepped: 0,
          toolInSpindle: 0,
          toolTable: [],
        },
        coolant: {
          mist: 0,
          flood: 0,
        },
        estop: 0,
        estopIn: 0,
        estopOut: 0,
        lube: 0,
        lubeLevel: 0,
      },
      toolTable: [],
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
      const newPosition = { ...mockStat.motion.traj.position, x: 10, y: 20 };
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
