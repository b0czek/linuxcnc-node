import {
  ErrorChannel,
  DEFAULT_ERROR_POLL_INTERVAL,
} from "../../src/ts/errorChannel";
import { LinuxCNCError } from "../../src/ts/types";
import { addon, NmlMessageType } from "../../src/ts/constants";

// Mock the native addon
jest.mock("../../src/ts/constants", () => ({
  addon: {
    NativeErrorChannel: jest.fn(),
    EMC_OPERATOR_ERROR_TYPE: 1,
    EMC_OPERATOR_TEXT_TYPE: 2,
    EMC_OPERATOR_DISPLAY_TYPE: 3,
    NML_ERROR_TYPE: 4,
    NML_TEXT_TYPE: 5,
    NML_DISPLAY_TYPE: 6,
  },
  NmlMessageType: {
    EMC_OPERATOR_ERROR: 1,
    EMC_OPERATOR_TEXT: 2,
    EMC_OPERATOR_DISPLAY: 3,
    NML_ERROR: 4,
    NML_TEXT: 5,
    NML_DISPLAY: 6,
  },
}));

describe("ErrorChannel", () => {
  let mockNativeInstance: any;
  let mockError: LinuxCNCError;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create a mock error object
    mockError = {
      type: NmlMessageType.EMC_OPERATOR_ERROR,
      message: "Test error message",
    };

    // Create mock native instance
    mockNativeInstance = {
      poll: jest.fn().mockReturnValue(null), // No error by default
      disconnect: jest.fn(),
    };

    (addon.NativeErrorChannel as jest.Mock).mockImplementation(
      () => mockNativeInstance
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("event emitter functionality", () => {
    it("should emit 'message' event when message occurs", () => {
      const errorChannel = new ErrorChannel();
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      errorChannel.on("message", callback1);
      errorChannel.on("message", callback2);
      errorChannel.on("message", callback3);

      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);

      expect(callback1).toHaveBeenCalledWith(mockError);
      expect(callback2).toHaveBeenCalledWith(mockError);
      expect(callback3).toHaveBeenCalledWith(mockError);

      errorChannel.destroy();
    });

    it("should emit specific message type events", () => {
      const errorChannel = new ErrorChannel();
      const operatorErrorCallback = jest.fn();
      const operatorTextCallback = jest.fn();
      const operatorDisplayCallback = jest.fn();

      errorChannel.on("operatorError", operatorErrorCallback);
      errorChannel.on("operatorText", operatorTextCallback);
      errorChannel.on("operatorDisplay", operatorDisplayCallback);

      // Test EMC_OPERATOR_ERROR
      mockError.type = NmlMessageType.EMC_OPERATOR_ERROR;
      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);
      expect(operatorErrorCallback).toHaveBeenCalledWith(mockError);

      // Test EMC_OPERATOR_TEXT
      mockError.type = NmlMessageType.EMC_OPERATOR_TEXT;
      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);
      expect(operatorTextCallback).toHaveBeenCalledWith(mockError);

      // Test EMC_OPERATOR_DISPLAY
      mockError.type = NmlMessageType.EMC_OPERATOR_DISPLAY;
      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);
      expect(operatorDisplayCallback).toHaveBeenCalledWith(mockError);

      errorChannel.destroy();
    });

    it("should not call removed listeners", () => {
      const errorChannel = new ErrorChannel();
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      errorChannel.on("message", callback1);
      errorChannel.on("message", callback2);
      errorChannel.off("message", callback1);

      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith(mockError);

      errorChannel.destroy();
    });

    it("should support once() for single-use listeners", () => {
      const errorChannel = new ErrorChannel();
      const callback = jest.fn();

      errorChannel.once("message", callback);

      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);
      expect(callback).toHaveBeenCalledTimes(1);

      // Second emission should not call the callback
      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);
      expect(callback).toHaveBeenCalledTimes(1);

      errorChannel.destroy();
    });
  });

  describe("polling configuration", () => {
    it("should use custom poll interval", () => {
      const errorChannel = new ErrorChannel({ pollInterval: 200 });
      const callback = jest.fn();

      errorChannel.on("message", callback);
      mockNativeInstance.poll.mockReturnValue(mockError);

      // Should not poll at default interval
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);
      expect(callback).not.toHaveBeenCalled();

      // Should poll at custom interval
      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalled();

      errorChannel.destroy();
    });
  });

  describe("polling behavior", () => {
    it("should handle errors during polling and continue", () => {
      const errorChannel = new ErrorChannel();
      const callback = jest.fn();
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      errorChannel.on("message", callback);

      mockNativeInstance.poll.mockImplementationOnce(() => {
        throw new Error("Poll error");
      });

      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error during ErrorChannel poll:",
        expect.any(Error)
      );

      // Should continue polling after error
      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);

      expect(callback).toHaveBeenCalledWith(mockError);

      consoleErrorSpy.mockRestore();
      errorChannel.destroy();
    });

    it("should stop polling after destroy", () => {
      const errorChannel = new ErrorChannel();
      const callback = jest.fn();

      errorChannel.on("message", callback);
      mockNativeInstance.poll.mockClear();

      errorChannel.destroy();

      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL * 5);

      // Poll should not be called after destroy
      expect(mockNativeInstance.poll).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it("should remove all listeners on destroy", () => {
      const errorChannel = new ErrorChannel();
      const callback = jest.fn();

      errorChannel.on("message", callback);
      expect(errorChannel.listenerCount("message")).toBe(1);

      errorChannel.destroy();
      expect(errorChannel.listenerCount("message")).toBe(0);
    });
  });
});
