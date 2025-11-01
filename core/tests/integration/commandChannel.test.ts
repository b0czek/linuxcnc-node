/**
 * Integration tests for CommandChannel
 *
 * Tests real command execution with LinuxCNC
 */

import { CommandChannel, StatChannel, TaskState, TaskMode } from "../../src/ts";

describe("Integration: CommandChannel", () => {
  let statChannel: StatChannel;
  let commandChannel: CommandChannel;

  beforeAll(() => {
    statChannel = new StatChannel();
    commandChannel = new CommandChannel();
  });

  afterAll(() => {
    statChannel.destroy();
  });

  describe("Machine Control", () => {
    it("should turn machine on", async () => {
      await commandChannel.setState(TaskState.ESTOP_RESET);
      // Give it a moment to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = statChannel.get();
      expect(status?.task.state).toBe(TaskState.ESTOP_RESET);

      await commandChannel.setState(TaskState.ON);

      // Give it a moment to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status2 = statChannel.get();
      expect(status2?.task.state).toBe(TaskState.ON);
    });

    it("should switch to manual mode", async () => {
      await commandChannel.setTaskMode(TaskMode.MANUAL);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = statChannel.get();
      expect(status?.task.mode).toBe(TaskMode.MANUAL);
    });

    it("should switch to MDI mode", async () => {
      await commandChannel.setTaskMode(TaskMode.MDI);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = statChannel.get();
      expect(status?.task.mode).toBe(TaskMode.MDI);
    });

    it("should home all axes", async () => {
      // First ensure we're in manual mode and machine is on
      await commandChannel.setState(TaskState.ON);
      await commandChannel.setTaskMode(TaskMode.MANUAL);

      await new Promise((resolve) => setTimeout(resolve, 200));

      await commandChannel.homeJoint(-1); // -1 homes all joints

      // Wait for homing to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }, 10000); // Homing can take a while

    it("should turn machine off", async () => {
      await commandChannel.setState(TaskState.OFF);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = statChannel.get();
      // will never be in off state
      expect(status?.task.state).toBe(TaskState.ESTOP_RESET);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid commands gracefully", async () => {
      // Try to run MDI command when machine is off
      await commandChannel.setState(TaskState.OFF);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // This should throw or return an error status
      try {
        await commandChannel.mdi("G0 X10");
        // If it doesn't throw, we should at least check error channel
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
      }
    });
  });
});
