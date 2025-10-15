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

  describe("callback management", () => {
    it("should call all registered callbacks when error occurs", () => {
      const errorChannel = new ErrorChannel();
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      errorChannel.onError(callback1);
      errorChannel.onError(callback2);
      errorChannel.onError(callback3);

      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);

      expect(callback1).toHaveBeenCalledWith(mockError);
      expect(callback2).toHaveBeenCalledWith(mockError);
      expect(callback3).toHaveBeenCalledWith(mockError);

      errorChannel.destroy();
    });

    it("should continue calling other callbacks even if one throws an error", () => {
      const errorChannel = new ErrorChannel();
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error("Callback error");
      });
      const goodCallback = jest.fn();
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      errorChannel.onError(errorCallback);
      errorChannel.onError(goodCallback);

      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);

      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error in ErrorChannel callback:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      errorChannel.destroy();
    });

    it("should not call removed callbacks", () => {
      const errorChannel = new ErrorChannel();
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      errorChannel.onError(callback1);
      errorChannel.onError(callback2);
      errorChannel.removeErrorCallback(callback1);

      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith(mockError);

      errorChannel.destroy();
    });

    it("should store callbacks in a Set (unique callbacks only)", () => {
      const errorChannel = new ErrorChannel();
      const callback = jest.fn();

      errorChannel.onError(callback);
      errorChannel.onError(callback);
      errorChannel.onError(callback);

      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL);

      // Set only stores unique callbacks, so should only be called once
      expect(callback).toHaveBeenCalledTimes(1);

      errorChannel.destroy();
    });
  });

  describe("setPollInterval()", () => {
    it("should enforce minimum interval of 50ms", () => {
      const errorChannel = new ErrorChannel();

      errorChannel.setPollInterval(10);
      expect(errorChannel.getPollInterval()).toBe(50);

      errorChannel.setPollInterval(25);
      expect(errorChannel.getPollInterval()).toBe(50);

      errorChannel.setPollInterval(50);
      expect(errorChannel.getPollInterval()).toBe(50);

      errorChannel.setPollInterval(100);
      expect(errorChannel.getPollInterval()).toBe(100);

      errorChannel.destroy();
    });

    it("should restart polling with new interval", () => {
      const errorChannel = new ErrorChannel({ pollInterval: 100 });
      const callback = jest.fn();

      errorChannel.onError(callback);

      mockNativeInstance.poll.mockClear();
      callback.mockClear();

      // Change to longer interval
      errorChannel.setPollInterval(500);

      // Simulate an error
      mockNativeInstance.poll.mockReturnValue(mockError);

      // Advance by old interval - should not poll yet
      jest.advanceTimersByTime(100);
      expect(callback).not.toHaveBeenCalled();

      // Advance to new interval
      jest.advanceTimersByTime(400);
      expect(callback).toHaveBeenCalled();

      errorChannel.destroy();
    });
  });

  describe("polling behavior", () => {
    it("should handle errors during polling and continue", () => {
      const errorChannel = new ErrorChannel();
      const callback = jest.fn();
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      errorChannel.onError(callback);

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

      errorChannel.onError(callback);
      mockNativeInstance.poll.mockClear();

      errorChannel.destroy();

      mockNativeInstance.poll.mockReturnValue(mockError);
      jest.advanceTimersByTime(DEFAULT_ERROR_POLL_INTERVAL * 5);

      // Poll should not be called after destroy
      expect(mockNativeInstance.poll).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
