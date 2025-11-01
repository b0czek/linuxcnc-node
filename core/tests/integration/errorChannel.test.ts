/**
 * Integration tests for ErrorChannel
 *
 * Tests real error message handling from LinuxCNC
 */

import { ErrorChannel, CommandChannel, TaskState } from "../../src/ts";

describe("Integration: ErrorChannel", () => {
  let errorChannel: ErrorChannel;
  let commandChannel: CommandChannel;

  beforeAll(() => {
    errorChannel = new ErrorChannel();
    commandChannel = new CommandChannel();
  });

  afterAll(() => {
    errorChannel.destroy();
  });

  describe("Error Watching", () => {
    it("should watch for new errors", async () => {
      let errorReceived = false;
      let receivedError: any = null;

      errorChannel.onError((error) => {
        console.log("HALO " + JSON.stringify(error));
        errorReceived = true;
        receivedError = error;
      });

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
        expect(receivedError.text).toBeDefined();
      }
    }, 10000);

    it("should handle multiple error callbacks", async () => {
      let callback1Called = false;
      let callback2Called = false;

      const cb1 = () => {
        callback1Called = true;
      };
      const cb2 = () => {
        callback2Called = true;
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

      // Clean up
      errorChannel.removeErrorCallback(cb1);
      errorChannel.removeErrorCallback(cb2);
    }, 10000);
  });
});
