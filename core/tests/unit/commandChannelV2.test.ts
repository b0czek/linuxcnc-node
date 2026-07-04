import { CommandChannelV2 } from "../../src/ts/commandChannelV2";
import type { WaitableCommandHandle } from "../../src/ts/commandChannelV2";
import { RcsStatus } from "@linuxcnc-node/types";

jest.mock("../../src/ts/constants", () => {
  const mockAddon = {
    NativeCommandChannel: jest.fn(),
  };

  return {
    addon: mockAddon,
  };
});

describe("CommandChannelV2", () => {
  let commandChannel: CommandChannelV2;
  let mockNativeInstance: any;

  beforeEach(() => {
    mockNativeInstance = {
      mdi: jest.fn(),
      stop: jest.fn(),
      setTool: jest.fn(),
      waitComplete: jest.fn(),
      waitCompleteForSerial: jest.fn(),
      disconnect: jest.fn(),
      serial: 0,
    };

    const { addon } = require("../../src/ts/constants");
    addon.NativeCommandChannel.mockImplementation(() => mockNativeInstance);

    commandChannel = new CommandChannelV2();
  });

  it("resolves public command handles after acceptance without exposing wait", async () => {
    mockNativeInstance.mdi.mockResolvedValue({
      status: RcsStatus.DONE,
      serial: 42,
    });

    const handle = commandChannel.mdi("G1 X10");

    expect("wait" in handle).toBe(false);
    await expect(handle).resolves.toEqual({
      status: RcsStatus.DONE,
      serial: 42,
    });
    expect(mockNativeInstance.mdi).toHaveBeenCalledWith("G1 X10");
    const { addon } = require("../../src/ts/constants");
    expect(addon.NativeCommandChannel).toHaveBeenCalledWith({
      waitMode: "accepted",
    });
  });

  it("waits for serial-specific completion from inside withLock", async () => {
    mockNativeInstance.mdi.mockResolvedValue({
      status: RcsStatus.DONE,
      serial: 7,
    });
    mockNativeInstance.waitCompleteForSerial.mockResolvedValue(RcsStatus.DONE);

    await expect(
      commandChannel.withLock((command) =>
        command.mdi("G1 X10").wait({ timeout: 5000 })
      )
    ).resolves.toBe(RcsStatus.DONE);

    expect(mockNativeInstance.waitCompleteForSerial).toHaveBeenCalledWith(
      7,
      5000
    );
  });

  it("rejects the handle when acceptance times out", async () => {
    mockNativeInstance.stop.mockResolvedValue({
      status: RcsStatus.UNINITIALIZED,
      serial: 8,
    });

    await expect(commandChannel.stop()).rejects.toThrow(
      "Command acceptance failed with RCS status"
    );
  });

  it.each([RcsStatus.ERROR, RcsStatus.UNINITIALIZED])(
    "rejects locked wait when completion returns %s",
    async (status) => {
      mockNativeInstance.mdi.mockResolvedValue({
        status: RcsStatus.DONE,
        serial: 10,
      });
      mockNativeInstance.waitCompleteForSerial.mockResolvedValue(status);

      await expect(
        commandChannel.withLock((command) => command.mdi("G4 P1").wait())
      ).rejects.toThrow("Command completion failed with RCS status");
    }
  );

  it("returns a serial-null waitable handle for setTool inside withLock", async () => {
    mockNativeInstance.setTool.mockResolvedValue(RcsStatus.DONE);

    const result = await commandChannel.withLock(async (command) => {
      const handle = command.setTool({ toolNo: 1 });

      await expect(handle).resolves.toEqual({
        status: RcsStatus.DONE,
        serial: null,
      });
      await expect(handle.wait({ timeout: 5000 })).resolves.toBe(
        RcsStatus.DONE
      );
      await expect(handle.serial).resolves.toBeNull();
      return "done";
    });

    expect(result).toBe("done");
    expect(mockNativeInstance.waitCompleteForSerial).not.toHaveBeenCalled();
  });

  it("runs concurrent withLock calls in FIFO order", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;

    const first = commandChannel.withLock(async () => {
      events.push("first-start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push("first-end");
    });

    const second = commandChannel.withLock(async () => {
      events.push("second-start");
    });

    await Promise.resolve();
    expect(events).toEqual(["first-start"]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("queues public commands behind an active lock", async () => {
    const events: string[] = [];
    let releaseLock!: () => void;
    mockNativeInstance.mdi.mockImplementation(async (command: string) => {
      events.push(`native-${command}`);
      return { status: RcsStatus.DONE, serial: 11 };
    });

    const locked = commandChannel.withLock(async () => {
      events.push("lock-start");
      await new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      events.push("lock-end");
    });

    await Promise.resolve();
    const publicHandle = commandChannel.mdi("G1 X10");
    await Promise.resolve();

    expect(events).toEqual(["lock-start"]);

    releaseLock();
    await Promise.all([locked, publicHandle]);

    expect(events).toEqual(["lock-start", "lock-end", "native-G1 X10"]);
  });

  it("releases the lock after a locked command fails", async () => {
    mockNativeInstance.mdi.mockResolvedValue({
      status: RcsStatus.DONE,
      serial: 12,
    });
    mockNativeInstance.waitCompleteForSerial.mockResolvedValueOnce(
      RcsStatus.ERROR
    );

    await expect(
      commandChannel.withLock((command) => command.mdi("G4 P1").wait())
    ).rejects.toThrow("Command completion failed with RCS status");

    await expect(
      commandChannel.withLock(async () => "next")
    ).resolves.toBe("next");
  });

  it("rejects wait when a locked handle escapes withLock", async () => {
    mockNativeInstance.mdi.mockResolvedValue({
      status: RcsStatus.DONE,
      serial: 13,
    });

    let escapedHandle!: WaitableCommandHandle;
    await commandChannel.withLock((command) => {
      escapedHandle = command.mdi("G1 X1");
    });

    await expect(escapedHandle.wait()).rejects.toThrow(
      "Command wait requires active withLock"
    );
    expect(mockNativeInstance.waitCompleteForSerial).not.toHaveBeenCalled();
  });

  it("invalidates lock context retained by escaped async callbacks", async () => {
    const events: string[] = [];
    let runEscapedCallback!: () => void;
    let releaseSecond!: () => void;
    let escapedHandle!: WaitableCommandHandle;
    let escapedWait!: Promise<RcsStatus>;

    mockNativeInstance.mdi.mockImplementation(async (command: string) => {
      events.push(`native-${command}`);
      return { status: RcsStatus.DONE, serial: 15 };
    });

    await commandChannel.withLock((command) => {
      escapedHandle = command.mdi("locked");
      new Promise<void>((resolve) => {
        runEscapedCallback = resolve;
      }).then(() => {
        void commandChannel.mdi("escaped");
        escapedWait = escapedHandle.wait();
      });
    });

    const second = commandChannel.withLock(async () => {
      events.push("second-start");
      await new Promise<void>((resolve) => {
        releaseSecond = resolve;
      });
      events.push("second-end");
    });

    await Promise.resolve();
    runEscapedCallback();
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(["native-locked", "second-start"]);
    await expect(escapedWait).rejects.toThrow(
      "Command wait requires active withLock"
    );
    expect(mockNativeInstance.waitCompleteForSerial).not.toHaveBeenCalled();

    releaseSecond();
    await second;
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual([
      "native-locked",
      "second-start",
      "second-end",
      "native-escaped",
    ]);
  });

  it("keeps the lock until fire-and-forget waits settle", async () => {
    const events: string[] = [];
    let releaseWait!: () => void;
    mockNativeInstance.mdi.mockResolvedValue({
      status: RcsStatus.DONE,
      serial: 14,
    });
    mockNativeInstance.waitCompleteForSerial.mockReturnValue(
      new Promise<RcsStatus>((resolve) => {
        releaseWait = () => resolve(RcsStatus.DONE);
      })
    );

    const first = commandChannel.withLock((command) => {
      void command.mdi("G1 X1").wait();
      events.push("first-callback-end");
    });
    const second = commandChannel.withLock(() => {
      events.push("second-start");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["first-callback-end"]);

    releaseWait();
    await Promise.all([first, second]);

    expect(events).toEqual(["first-callback-end", "second-start"]);
  });

  it("drains fire-and-forget waits before releasing a rejected lock", async () => {
    const events: string[] = [];
    let releaseWait!: () => void;
    mockNativeInstance.mdi.mockResolvedValue({
      status: RcsStatus.DONE,
      serial: 16,
    });
    mockNativeInstance.waitCompleteForSerial.mockReturnValue(
      new Promise<RcsStatus>((resolve) => {
        releaseWait = () => resolve(RcsStatus.DONE);
      })
    );

    const first = commandChannel.withLock((command) => {
      void command.mdi("G1 X1").wait();
      throw new Error("callback failed");
    });
    const second = commandChannel.withLock(() => {
      events.push("second-start");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual([]);

    releaseWait();
    await expect(first).rejects.toThrow("callback failed");
    await second;

    expect(events).toEqual(["second-start"]);
  });

  it("reuses the lock for nested withLock calls", async () => {
    const events: string[] = [];

    await commandChannel.withLock(async () => {
      events.push("outer-start");
      await commandChannel.withLock(async () => {
        events.push("inner");
      });
      events.push("outer-end");
    });

    expect(events).toEqual(["outer-start", "inner", "outer-end"]);
  });
});
