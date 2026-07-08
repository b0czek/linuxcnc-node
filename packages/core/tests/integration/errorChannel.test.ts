/**
 * Integration tests for ErrorChannel
 *
 * Tests real error message handling from LinuxCNC
 */

import { ErrorChannel, CommandChannel, StatChannel } from "../../src/ts";
import { TaskState, NmlMessageType } from "@linuxcnc-node/types";
import { startLinuxCNC, stopLinuxCNC, setupLinuxCNC } from "./setupLinuxCNC";

describe("Integration: ErrorChannel", () => {
  let errorChannel: ErrorChannel;
  let commandChannel: CommandChannel;
  let statChannel: StatChannel;

  beforeAll(async () => {
    await startLinuxCNC();

    errorChannel = new ErrorChannel();
    commandChannel = new CommandChannel();
    statChannel = new StatChannel();

    await setupLinuxCNC(commandChannel, statChannel);
  }, 30000);

  afterAll(async () => {
    errorChannel.destroy();
    statChannel.destroy();
    commandChannel.destroy();

    await stopLinuxCNC();
  });

  describe("Basic Error Watching", () => {
    it("should watch for new errors", async () => {
      let errorReceived = false;
      let receivedError: any = null;

      const callback = (error: any) => {
        errorReceived = true;
        receivedError = error;
      };

      errorChannel.on("message", callback);

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

      // Expect an error to have been received
      expect(errorReceived).toBe(true);
      expect(receivedError).toBeDefined();
      expect(receivedError.type).toBeDefined();
      expect(receivedError.message).toBeDefined();
      expect(typeof receivedError.message).toBe("string");
      expect(receivedError.message.length).toBeGreaterThan(0);

      errorChannel.off("message", callback);
    }, 10000);

    it("should handle multiple error listeners", async () => {
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

      errorChannel.on("message", cb1);
      errorChannel.on("message", cb2);

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
      expect(callback1Called).toBe(true);
      expect(callback2Called).toBe(true);
      expect(callback1Error).toBeDefined();
      expect(callback2Error).toBeDefined();
      expect(callback1Error.type).toBe(callback2Error.type);
      expect(callback1Error.message).toBe(callback2Error.message);

      // Clean up
      errorChannel.off("message", cb1);
      errorChannel.off("message", cb2);
    }, 10000);
  });

  describe("Message Types", () => {
    it("should receive EMC_OPERATOR_ERROR messages on specific event", async () => {
      let receivedError: any = null;

      const callback = (error: any) => {
        receivedError = error;
      };

      errorChannel.on("operatorError", callback);

      // Send an operator error message
      await commandChannel.sendOperatorError("Test Error Message");
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(receivedError).toBeDefined();
      expect(receivedError.type).toBe(NmlMessageType.EMC_OPERATOR_ERROR);
      expect(receivedError.message).toContain("Test Error Message");

      errorChannel.off("operatorError", callback);
    }, 10000);

    it("should receive EMC_OPERATOR_TEXT messages on specific event", async () => {
      let receivedMessage: any = null;

      const callback = (error: any) => {
        receivedMessage = error;
      };

      errorChannel.on("operatorText", callback);

      // Send an operator text message
      await commandChannel.sendOperatorText("Test Text Message");
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(receivedMessage).not.toBeNull();
      expect(receivedMessage.type).toBe(NmlMessageType.EMC_OPERATOR_TEXT);
      expect(receivedMessage.message).toContain("Test Text Message");

      errorChannel.off("operatorText", callback);
    }, 10000);

    it("should receive EMC_OPERATOR_DISPLAY messages on specific event", async () => {
      let receivedMessage: any = null;

      const callback = (error: any) => {
        receivedMessage = error;
      };

      errorChannel.on("operatorDisplay", callback);

      // Send an operator display message
      await commandChannel.sendOperatorDisplay("Test Display Message");
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Expect to have received the display message
      expect(receivedMessage).toBeDefined();
      expect(receivedMessage.type).toBe(NmlMessageType.EMC_OPERATOR_DISPLAY);
      expect(receivedMessage.message).toContain("Test Display Message");

      errorChannel.off("operatorDisplay", callback);
    }, 10000);

    it("should emit both generic 'message' and specific type events", async () => {
      let genericReceived = false;
      let specificReceived = false;

      errorChannel.on("message", () => {
        genericReceived = true;
      });
      errorChannel.on("operatorText", () => {
        specificReceived = true;
      });

      await commandChannel.sendOperatorText("Dual Event Test");
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(genericReceived).toBe(true);
      expect(specificReceived).toBe(true);

      errorChannel.removeAllListeners("message");
      errorChannel.removeAllListeners("operatorText");
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

      errorChannel.on("message", callback);

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

      errorChannel.off("message", callback);
    }, 15000);
  });
});
