import { RcsStatus } from "@linuxcnc-node/types";
import { CommandTransport } from "../../src/ts/commandTransport";

jest.mock("../../src/ts/constants", () => ({
  addon: {
    NativeCommandChannel: jest.fn(),
  },
}));

interface Snapshot {
  echoSerial: number;
  status: RcsStatus;
}

interface NativeCommandChannelMock {
  mdi: jest.Mock;
  runProgram: jest.Mock;
  setFeedRate: jest.Mock;
  setTool: jest.Mock;
  getStatusSnapshot: jest.Mock;
  disconnect: jest.Mock;
  serial: number;
}

describe("CommandTransport", () => {
  let transport: CommandTransport;
  let native: NativeCommandChannelMock;
  let snapshot: Snapshot;
  let nextSerial: number;

  beforeEach(() => {
    jest.useFakeTimers();
    snapshot = { echoSerial: 0, status: RcsStatus.EXEC };
    nextSerial = 0;
    native = {
      mdi: jest.fn(() => ++nextSerial),
      runProgram: jest.fn(() => Promise.resolve({ serial: ++nextSerial })),
      setFeedRate: jest.fn(() => ++nextSerial),
      setTool: jest.fn(() => Promise.resolve(RcsStatus.DONE)),
      getStatusSnapshot: jest.fn(() => ({ ...snapshot })),
      disconnect: jest.fn(),
      serial: 41,
    };

    const { addon } = require("../../src/ts/constants");
    addon.NativeCommandChannel.mockImplementation(() => native);
    transport = new CommandTransport();
  });

  afterEach(() => {
    transport.disconnect();
    jest.useRealTimers();
  });

  async function flush(): Promise<void> {
    for (let index = 0; index < 20; index += 1) {
      await Promise.resolve();
      jest.advanceTimersByTime(0);
    }
  }

  async function poll(
    echoSerial: number,
    status: RcsStatus,
    advance = 10
  ): Promise<void> {
    snapshot = { echoSerial, status };
    await flush();
    jest.advanceTimersByTime(Math.max(advance, 10));
    await flush();
  }

  it("creates the native channel in sent mode", () => {
    const { addon } = require("../../src/ts/constants");
    expect(addon.NativeCommandChannel).toHaveBeenCalledWith({
      waitMode: "sent",
    });
    expect(transport.getSerial()).toBe(41);
  });

  it("dispatches native commands by name and resolves acceptance by serial", async () => {
    const handle = transport.send("mdi", ["G0 X1"]);

    expect(native.mdi).toHaveBeenCalledWith("G0 X1");
    await poll(1, RcsStatus.EXEC, 0);
    await expect(handle.accepted).resolves.toEqual({
      status: RcsStatus.DONE,
      serial: 1,
    });
    await expect(handle.serial).resolves.toBe(1);
    expect(handle.completed).toBeUndefined();
  });

  it("tracks completion when requested", async () => {
    const handle = transport.send("runProgram", [0], {
      tracking: "completion",
      completionTimeout: 1000,
    });

    await poll(1, RcsStatus.EXEC, 0);
    await expect(handle.accepted).resolves.toMatchObject({ serial: 1 });

    await poll(1, RcsStatus.DONE, 100);
    await expect(handle.completed).resolves.toBe(RcsStatus.DONE);
  });

  it("rejects completion when the completion deadline expires", async () => {
    const handle = transport.send("runProgram", [0], {
      tracking: "completion",
      completionTimeout: 50,
    });

    await poll(1, RcsStatus.EXEC, 0);
    await expect(handle.accepted).resolves.toMatchObject({ serial: 1 });

    await poll(1, RcsStatus.EXEC, 60);
    await expect(handle.completed).rejects.toThrow(
      "Command completion timed out for serial 1"
    );
  });

  it("handles local non-serial commands", async () => {
    const handle = transport.send("setTool", [{ toolNo: 1 }], {
      tracking: "completion",
    });

    expect(native.setTool).toHaveBeenCalledWith({ toolNo: 1 });
    await expect(handle.accepted).resolves.toEqual({
      status: RcsStatus.DONE,
      serial: null,
    });
    await expect(handle.completed).resolves.toBe(RcsStatus.DONE);
  });

  it("cancels outstanding tracking on disconnect", async () => {
    const handle = transport.send("runProgram", [0], {
      tracking: "completion",
    });
    await flush();

    transport.disconnect();

    await expect(handle.accepted).rejects.toThrow(
      "Command transport disconnected"
    );
    await expect(handle.completed).rejects.toThrow(
      "Command transport disconnected"
    );
    expect(native.disconnect).toHaveBeenCalled();
  });
});
