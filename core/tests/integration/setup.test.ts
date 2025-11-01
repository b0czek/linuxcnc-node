/**
 * Integration test setup verification
 *
 * This test verifies that the LinuxCNC simulator is running and accessible.
 */

import { StatChannel, CommandChannel, ErrorChannel } from "../../src/ts";

describe("Integration Test Setup", () => {
  describe("LinuxCNC Connection", () => {
    it("should connect to StatChannel", () => {
      const statChannel = new StatChannel();

      try {
        // Try to get status to verify it's actually working
        const status = statChannel.get();
        expect(status).toBeDefined();
        expect(status?.task).toBeDefined();
        expect(status?.motion).toBeDefined();
        expect(status?.io).toBeDefined();
      } finally {
        statChannel.destroy();
      }
    });

    it("should connect to CommandChannel", () => {
      const commandChannel = new CommandChannel();

      // CommandChannel doesn't have a public isConnected method
      // Just verify it can be instantiated without throwing
      expect(commandChannel).toBeDefined();
    });

    it("should connect to ErrorChannel", () => {
      const errorChannel = new ErrorChannel();

      try {
        // ErrorChannel doesn't have a public isConnected method
        // Just verify it can be instantiated without throwing
        expect(errorChannel).toBeDefined();
      } finally {
        errorChannel.destroy();
      }
    });
  });

  describe("LinuxCNC State", () => {
    let statChannel: StatChannel;

    beforeAll(() => {
      statChannel = new StatChannel();
    });

    afterAll(() => {
      statChannel.destroy();
    });

    it("should have valid task state", () => {
      const status = statChannel.get();

      expect(status?.task.state).toBeDefined();
      expect(status?.task.mode).toBeDefined();
      expect(status?.task.interpState).toBeDefined();
    });

    it("should have valid motion state", () => {
      const status = statChannel.get();

      expect(status?.motion.traj).toBeDefined();
      expect(status?.motion.traj.position).toBeDefined();
      expect(status?.motion.axis).toBeDefined();
      expect(Array.isArray(status?.motion.axis)).toBe(true);
    });

    it("should have valid IO state", () => {
      const status = statChannel.get();

      expect(status?.io.coolant).toBeDefined();
      expect(status?.io.tool).toBeDefined();
    });
  });
});
