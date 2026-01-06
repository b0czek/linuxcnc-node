import { CommandChannel } from "../../src/ts/commandChannel";
import { RcsStatus, TaskMode, TaskState } from "@linuxcnc/types";

jest.mock("../../src/ts/constants", () => {
  // Create a mock addon with all the constants
  const mockAddon = {
    NativeCommandChannel: jest.fn(),
  };

  return {
    addon: mockAddon,
  };
});

describe("CommandChannel", () => {
  let commandChannel: CommandChannel;
  let mockNativeInstance: any;

  beforeEach(() => {
    mockNativeInstance = {
      setTaskMode: jest.fn(),
      setState: jest.fn(),
      taskPlanSynch: jest.fn(),
    };

    const { addon } = require("../../src/ts/constants");
    addon.NativeCommandChannel.mockImplementation(() => mockNativeInstance);

    commandChannel = new CommandChannel();
  });

  describe("exec method error handling", () => {
    it("should return status when native method returns DONE", async () => {
      mockNativeInstance.setTaskMode.mockResolvedValue(RcsStatus.DONE);

      const result = await commandChannel.setTaskMode(TaskMode.MDI);

      expect(result).toBe(RcsStatus.DONE);
      expect(mockNativeInstance.setTaskMode).toHaveBeenCalledWith(TaskMode.MDI);
    });

    it("should return status when native method returns EXEC", async () => {
      mockNativeInstance.setTaskMode.mockResolvedValue(RcsStatus.EXEC);

      const result = await commandChannel.setTaskMode(TaskMode.AUTO);

      expect(result).toBe(RcsStatus.EXEC);
    });

    it("should throw error when native method returns ERROR status", async () => {
      mockNativeInstance.setState.mockResolvedValue(RcsStatus.ERROR);

      await expect(commandChannel.setState(TaskState.ON)).rejects.toThrow(
        "Command failed with RCS status"
      );
    });

    it("should throw error when native method returns UNINITIALIZED status", async () => {
      mockNativeInstance.setState.mockResolvedValue(RcsStatus.UNINITIALIZED);

      await expect(commandChannel.setState(TaskState.ESTOP)).rejects.toThrow(
        "Command failed with RCS status"
      );
    });

    it("should wrap native errors with descriptive message", async () => {
      const nativeError = new Error("NML connection failed");
      mockNativeInstance.taskPlanSynch.mockRejectedValue(nativeError);

      await expect(commandChannel.taskPlanSynch()).rejects.toThrow(
        "Command native execution failed: NML connection failed"
      );
    });

    it("should handle native errors without message property", async () => {
      mockNativeInstance.setTaskMode.mockRejectedValue("string error");

      await expect(commandChannel.setTaskMode(TaskMode.MANUAL)).rejects.toThrow(
        "Command native execution failed: string error"
      );
    });
  });
});
