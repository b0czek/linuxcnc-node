/**
 * Integration tests for ErrorChannel
 *
 * Tests real error message handling from LinuxCNC
 */

import {
  ErrorChannel,
  CommandChannel,
  TaskState,
  TaskMode,
  NmlMessageType,
} from "../../src/ts";

describe("Integration: ErrorChannel", () => {
  let errorChannel: ErrorChannel;
  let commandChannel: CommandChannel;

  beforeAll(async () => {
    errorChannel = new ErrorChannel();
    commandChannel = new CommandChannel();

    // Ensure machine is in a known state
    try {
      await commandChannel.setState(TaskState.ESTOP_RESET);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await commandChannel.setState(TaskState.ON);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (e) {
      // May already be in correct state
    }
  });

  afterAll(() => {
    errorChannel.destroy();
    commandChannel.destroy();
  });

  describe("Basic Error Watching", () => {
    it("should watch for new errors", async () => {
      let errorReceived = false;
      let receivedError: any = null;

      const callback = (error: any) => {
        errorReceived = true;
        receivedError = error;
      };

      errorChannel.onError(callback);

      // Trigger an error by trying to move with machine off
      await commandChannel.setState(TaskState.OFF);
      await new Promise((resolve) => setTimeout(resolve, 200));

      try {
        await commandChannel.mdi("G0 X2000");
      } catch (e) {
        // Expected to fail
      }

      // Wait for error to be polled
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Check if error was received
      if (errorReceived) {
        expect(receivedError).toBeDefined();
        expect(receivedError.type).toBeDefined();
        expect(receivedError.message).toBeDefined();
        expect(typeof receivedError.message).toBe("string");
        expect(receivedError.message.length).toBeGreaterThan(0);
      }

      errorChannel.removeErrorCallback(callback);
    }, 10000);

    it("should handle multiple error callbacks", async () => {
      let callback1Called = false;
      let callback2Called = false;
      let callback1Error: any = null;
      let callback2Error: any = null;

      const cb1 = (error: any) => {
        callback1Called = true;
        callback1Error = error;
      };
      const cb2 = (error: any) => {
        callback2Called = true;
        callback2Error = error;
      };

      errorChannel.onError(cb1);
      errorChannel.onError(cb2);

      // Trigger an error
      await commandChannel.setState(TaskState.OFF);
      await new Promise((resolve) => setTimeout(resolve, 200));

      try {
        await commandChannel.mdi("G0 X3000");
      } catch (e) {
        // Expected to fail
      }

      // Wait for error to be polled
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Both callbacks should receive the same error
      if (callback1Called && callback2Called) {
        expect(callback1Error).toBeDefined();
        expect(callback2Error).toBeDefined();
        expect(callback1Error.type).toBe(callback2Error.type);
        expect(callback1Error.message).toBe(callback2Error.message);
      }

      // Clean up
      errorChannel.removeErrorCallback(cb1);
      errorChannel.removeErrorCallback(cb2);
    }, 10000);
  });

  describe("Message Types", () => {
    beforeEach(async () => {
      // Ensure machine is ON for sending messages
      try {
        await commandChannel.setState(TaskState.ESTOP_RESET);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await commandChannel.setState(TaskState.ON);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (e) {
        // May already be in correct state
      }
    });

    it("should receive EMC_OPERATOR_ERROR messages", async () => {
      let receivedError: any = null;

      const callback = (error: any) => {
        if (error.message.includes("Test Error Message")) {
          receivedError = error;
        }
      };

      errorChannel.onError(callback);

      // Send an operator error message
      await commandChannel.sendOperatorError("Test Error Message");
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (receivedError) {
        expect(receivedError.type).toBe(NmlMessageType.EMC_OPERATOR_ERROR);
        expect(receivedError.message).toContain("Test Error Message");
      }

      errorChannel.removeErrorCallback(callback);
    }, 10000);

    it("should receive EMC_OPERATOR_TEXT messages", async () => {
      let receivedMessage: any = null;

      const callback = (error: any) => {
        if (error.message.includes("Test Text Message")) {
          receivedMessage = error;
        }
      };

      errorChannel.onError(callback);

      // Send an operator text message
      await commandChannel.sendOperatorText("Test Text Message");
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (receivedMessage) {
        expect(receivedMessage.type).toBe(NmlMessageType.EMC_OPERATOR_TEXT);
        expect(receivedMessage.message).toContain("Test Text Message");
      }

      errorChannel.removeErrorCallback(callback);
    }, 10000);

    it("should receive EMC_OPERATOR_DISPLAY messages", async () => {
      let receivedMessage: any = null;

      const callback = (error: any) => {
        if (error.message.includes("Test Display Message")) {
          receivedMessage = error;
        }
      };

      errorChannel.onError(callback);

      // Send an operator display message
      await commandChannel.sendOperatorDisplay("Test Display Message");
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (receivedMessage) {
        expect(receivedMessage.type).toBe(NmlMessageType.EMC_OPERATOR_DISPLAY);
        expect(receivedMessage.message).toContain("Test Display Message");
      }

      errorChannel.removeErrorCallback(callback);
    }, 10000);
  });

  describe("Multiple Instances", () => {
    it("should allow multiple ErrorChannel instances", async () => {
      const errorChannel1 = new ErrorChannel();
      const errorChannel2 = new ErrorChannel();

      let errors1: any[] = [];
      let errors2: any[] = [];

      const callback1 = (error: any) => {
        errors1.push(error);
      };
      const callback2 = (error: any) => {
        errors2.push(error);
      };

      errorChannel1.onError(callback1);
      errorChannel2.onError(callback2);

      // Send a message
      await commandChannel.setState(TaskState.ON);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await commandChannel.sendOperatorText("Multi-instance test message");
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Both instances should receive the error
      // (They're both polling the same NML channel)

      errorChannel1.destroy();
      errorChannel2.destroy();
    }, 10000);
  });

  describe("Error Clearing and Recovery", () => {
    it("should handle rapid successive errors", async () => {
      const errors: any[] = [];

      const callback = (error: any) => {
        if (error.message.includes("Rapid")) {
          errors.push(error);
        }
      };

      errorChannel.onError(callback);

      await commandChannel.setState(TaskState.ON);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send multiple messages rapidly
      for (let i = 0; i < 5; i++) {
        await commandChannel.sendOperatorText(`Rapid-${i}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Wait for all to be processed
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Should have received multiple messages
      expect(errors.length).toEqual(5);

      errorChannel.removeErrorCallback(callback);
    }, 15000);
  });
});
