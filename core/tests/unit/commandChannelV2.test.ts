import { RcsStatus, TaskState } from "@linuxcnc-node/types";
import { CommandChannelV2 } from "../../src/ts/commandChannelV2";

jest.mock("../../src/ts/constants", () => ({
  addon: {
    NativeCommandChannel: jest.fn(),
  },
}));

interface Snapshot {
  echoSerial: number;
  status: RcsStatus;
}

describe("CommandChannelV2 policy scheduler", () => {
  let channel: CommandChannelV2;
  let native: Record<string, jest.Mock>;
  let snapshot: Snapshot;
  let nextSerial: number;

  beforeEach(() => {
    jest.useFakeTimers();
    snapshot = { echoSerial: 0, status: RcsStatus.DONE };
    nextSerial = 0;
    native = {
      mdi: jest.fn(() => ++nextSerial),
      setRapidRate: jest.fn(() => ++nextSerial),
      setFeedRate: jest.fn(() => ++nextSerial),
      stop: jest.fn(() => ++nextSerial),
      abortTask: jest.fn(() => ++nextSerial),
      pauseProgram: jest.fn(() => ++nextSerial),
      jogStop: jest.fn(() => ++nextSerial),
      setState: jest.fn(() => ++nextSerial),
      programOpen: jest.fn(() => Promise.resolve(++nextSerial)),
      setTool: jest.fn(() => Promise.resolve(RcsStatus.DONE)),
      getStatusSnapshot: jest.fn(() => ({ ...snapshot })),
      disconnect: jest.fn(),
    };

    const { addon } = require("../../src/ts/constants");
    addon.NativeCommandChannel.mockImplementation(() => native);
    channel = new CommandChannelV2();
  });

  afterEach(() => {
    channel.disconnect();
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

  it("builds disjoint public and exclusive facades from the policy catalog", async () => {
    expect(typeof channel.setRapidRate).toBe("function");
    expect(typeof channel.setOptionalStop).toBe("function");
    expect(typeof channel.stop).toBe("function");
    expect("mdi" in channel).toBe(false);

    let exclusiveFacade: object | undefined;
    const transaction = channel.exclusive((command) => {
      exclusiveFacade = command;
    });
    await flush();
    await transaction;

    expect(exclusiveFacade).toBeDefined();
    expect("mdi" in exclusiveFacade!).toBe(true);
    expect("setRapidRate" in exclusiveFacade!).toBe(true);
    expect("setOptionalStop" in exclusiveFacade!).toBe(true);
    expect("stop" in exclusiveFacade!).toBe(false);

    const { addon } = require("../../src/ts/constants");
    expect(addon.NativeCommandChannel).toHaveBeenCalledWith({
      waitMode: "sent",
    });
  });

  it("auto-drains exclusive commands sequentially and ignores later immediate serials for completion", async () => {
    const transaction = channel.exclusive((command) => {
      void command.mdi("G1 X10");
      void command.mdi("G1 X20");
    });
    await flush();

    expect(native.mdi).toHaveBeenCalledTimes(1);
    expect(native.mdi).toHaveBeenLastCalledWith("G1 X10");

    await poll(1, RcsStatus.EXEC, 0);
    const rapid = channel.setRapidRate(0.5);
    expect(native.setRapidRate).toHaveBeenCalledWith(0.5);
    expect("completed" in rapid).toBe(false);

    await poll(2, RcsStatus.EXEC);
    await expect(rapid).resolves.toEqual({
      status: RcsStatus.DONE,
      serial: 2,
    });
    expect(native.mdi).toHaveBeenCalledTimes(1);

    await poll(2, RcsStatus.DONE);
    expect(native.mdi).toHaveBeenCalledTimes(2);
    expect(native.mdi).toHaveBeenLastCalledWith("G1 X20");

    await poll(3, RcsStatus.DONE);
    await expect(transaction).resolves.toBeUndefined();
  });

  it("uses immediate commands inside exclusive callbacks as ordered acceptance barriers", async () => {
    let rapid: ReturnType<CommandChannelV2["setRapidRate"]> | undefined;
    const transaction = channel.exclusive((command) => {
      rapid = command.setRapidRate(0.5);
      void command.mdi("G1 X10");
      void command.mdi("G1 X20");
    });
    await flush();

    expect(native.setRapidRate).toHaveBeenCalledTimes(1);
    expect(native.setRapidRate).toHaveBeenCalledWith(0.5);
    expect(native.mdi).not.toHaveBeenCalled();
    expect(rapid).toBeDefined();
    expect("completed" in rapid!).toBe(false);

    await poll(1, RcsStatus.EXEC, 0);
    await expect(rapid).resolves.toEqual({
      status: RcsStatus.DONE,
      serial: 1,
    });
    expect(native.mdi).toHaveBeenCalledTimes(1);
    expect(native.mdi).toHaveBeenLastCalledWith("G1 X10");

    await poll(2, RcsStatus.DONE);
    expect(native.mdi).toHaveBeenCalledTimes(2);
    await poll(3, RcsStatus.DONE);
    await expect(transaction).resolves.toBeUndefined();
  });

  it("can dispatch an immediate command during an active exclusive command after acceptance", async () => {
    let rapid: ReturnType<CommandChannelV2["setRapidRate"]> | undefined;
    const transaction = channel.exclusive(async (command) => {
      const dwell = command.mdi("G4 P1");
      await dwell;
      rapid = command.setRapidRate(0.5);
      await rapid;
      await dwell.completed;
    });
    await flush();

    expect(native.mdi).toHaveBeenCalledTimes(1);
    await poll(1, RcsStatus.EXEC, 0);
    await flush();
    expect(native.setRapidRate).toHaveBeenCalledTimes(1);

    await poll(2, RcsStatus.EXEC);
    await expect(rapid).resolves.toMatchObject({ serial: 2 });
    await poll(2, RcsStatus.DONE);
    await expect(transaction).resolves.toBeUndefined();
  });

  it("rejects a concurrent exclusive transaction while one is active", async () => {
    const first = channel.exclusive((command) => {
      void command.mdi("first");
    });
    const second = channel.exclusive((command) => {
      void command.mdi("second");
    });
    await flush();

    expect(native.mdi).toHaveBeenCalledTimes(1);
    expect(native.mdi).toHaveBeenCalledWith("first");
    await expect(second).rejects.toThrow(
      "Exclusive transaction already active"
    );

    await poll(1, RcsStatus.DONE, 0);
    await expect(first).resolves.toBeUndefined();

    const next = channel.exclusive((command) => {
      void command.mdi("next");
    });
    await flush();
    expect(native.mdi).toHaveBeenCalledTimes(2);
    expect(native.mdi).toHaveBeenLastCalledWith("next");
    await poll(2, RcsStatus.DONE);
    await expect(next).resolves.toBeUndefined();
  });

  it.each([
    ["stop", () => channel.stop()],
    ["abortTask", () => channel.abortTask()],
    ["pauseProgram", () => channel.pauseProgram()],
    ["jogStop", () => channel.jogStop(0, true)],
  ])(
    "dispatches preemptive %s immediately and rejects active transactions",
    async (method, invoke) => {
      const active = channel.exclusive((command) => {
        void command.mdi("active");
      });
      await flush();

      const preemptive = invoke();
      expect(native[method]).toHaveBeenCalledTimes(1);
      expect(native.mdi).toHaveBeenCalledTimes(1);
      await expect(active).rejects.toThrow(`preempted by ${method}`);

      await poll(2, RcsStatus.DONE, 0);
      await expect(preemptive).resolves.toEqual({
        status: RcsStatus.DONE,
        serial: 2,
      });
    }
  );

  it("dispatches preemptive state values at top level and exclusive state values in a transaction", async () => {
    const off = channel.setState(TaskState.OFF);
    expect(native.setState).toHaveBeenCalledWith(TaskState.OFF);
    await poll(1, RcsStatus.DONE, 0);
    await off;

    const transaction = channel.exclusive((command) => {
      void command.setState(TaskState.ON);
    });
    await flush();
    expect(native.setState).toHaveBeenLastCalledWith(TaskState.ON);
    await poll(2, RcsStatus.DONE, 0);
    await transaction;
  });

  it("clears busy state after an exclusive error and accepts new work afterward", async () => {
    const failed = channel.exclusive((command) => {
      void command.mdi("failed");
    });
    await flush();

    await poll(1, RcsStatus.ERROR, 0);
    await expect(failed).rejects.toThrow("RCS status: ERROR");
    expect(native.mdi).toHaveBeenCalledTimes(1);

    const next = channel.exclusive((command) => {
      void command.mdi("next");
    });
    await flush();
    expect(native.mdi).toHaveBeenLastCalledWith("next");
    await poll(2, RcsStatus.DONE, 0);
    await expect(next).resolves.toBeUndefined();
  });

  it("applies transaction timeout defaults and trailing command overrides", async () => {
    const timedOut = channel.exclusive(
      (command) => {
        void command.mdi("slow");
      },
      { timeout: 50 }
    );
    await flush();
    await poll(1, RcsStatus.EXEC, 0);

    jest.advanceTimersByTime(49);
    await flush();
    expect(jest.isMockFunction(native.mdi)).toBe(true);
    jest.advanceTimersByTime(1);
    await flush();

    await expect(timedOut).rejects.toThrow(
      "Command completion timed out for serial 1"
    );

    const overridden = channel.exclusive(
      (command) => {
        void command.mdi("override", { timeout: 100 });
      },
      { timeout: 10 }
    );
    await flush();
    await poll(2, RcsStatus.EXEC, 0);
    jest.advanceTimersByTime(20);
    await flush();

    await poll(2, RcsStatus.DONE);
    await expect(overridden).resolves.toBeUndefined();
  });

  it("uses the one-second acceptance timeout and recovers for new work", async () => {
    const timedOut = channel.exclusive((command) => {
      void command.mdi("unaccepted");
    });
    await flush();

    jest.advanceTimersByTime(1000);
    await flush();
    await expect(timedOut).rejects.toThrow(
      "Command acceptance timed out for serial 1"
    );

    const next = channel.exclusive((command) => {
      void command.mdi("next");
    });
    await flush();
    await poll(2, RcsStatus.DONE);
    await expect(next).resolves.toBeUndefined();
  });

  it("preserves callback errors, aborts undispatched work, and clears busy state", async () => {
    const callbackError = new Error("callback failed");
    const failed = channel.exclusive((command) => {
      void command.mdi("never-1");
      void command.mdi("never-2");
      throw callbackError;
    });
    await flush();

    await expect(failed).rejects.toBe(callbackError);
    expect(native.mdi).not.toHaveBeenCalled();

    const following = channel.exclusive((command) => {
      void command.mdi("following");
    });
    await flush();
    expect(native.mdi).toHaveBeenCalledWith("following");
    await poll(1, RcsStatus.DONE, 0);
    await expect(following).resolves.toBeUndefined();
  });

  it("lets callback logic await acceptance and exclusive completion independently", async () => {
    const events: string[] = [];
    const transaction = channel.exclusive(async (command) => {
      const move = command.mdi("conditional");
      const accepted = await move;
      events.push(`accepted-${accepted.serial}`);
      await move.completed;
      events.push("completed");
      command.mdi("after");
    });
    await flush();

    await poll(1, RcsStatus.EXEC, 0);
    expect(events).toEqual(["accepted-1"]);
    await poll(1, RcsStatus.DONE);
    expect(events).toEqual(["accepted-1", "completed"]);
    expect(native.mdi).toHaveBeenCalledTimes(2);

    await poll(2, RcsStatus.DONE);
    await expect(transaction).resolves.toBeUndefined();
  });

  it("keeps setTool as a local exclusive operation", async () => {
    let acceptedSerial: number | null | undefined;
    const transaction = channel.exclusive(async (command) => {
      const handle = command.setTool({ toolNo: 7 });
      acceptedSerial = (await handle).serial;
      await handle.completed;
    });
    await flush();

    await expect(transaction).resolves.toBeUndefined();
    expect(acceptedSerial).toBeNull();
    expect(native.setTool).toHaveBeenCalledWith({ toolNo: 7 });
    expect(native.getStatusSnapshot).not.toHaveBeenCalled();
  });

  it("tracks program-open completion while immediate commands advance the serial", async () => {
    const opened = channel.exclusive((command) => {
      void command.programOpen("/tmp/example.ngc");
    });
    await flush();

    await poll(1, RcsStatus.EXEC, 0);
    const feed = channel.setFeedRate(0.75);
    await poll(2, RcsStatus.EXEC);
    await expect(feed).resolves.toMatchObject({ serial: 2 });
    let settled = false;
    void opened.finally(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    await poll(2, RcsStatus.DONE);
    await expect(opened).resolves.toBeUndefined();
  });

  it("rejects outstanding handles and transactions on disconnect", async () => {
    const immediate = channel.setRapidRate(0.5);
    const transaction = channel.exclusive((command) => {
      void command.mdi("active");
    });
    await flush();

    channel.disconnect();
    await expect(immediate).rejects.toThrow("disconnected");
    await expect(transaction).rejects.toThrow("disconnected");
    expect(native.disconnect).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid exclusive timeouts before invoking the callback", async () => {
    const callback = jest.fn();
    await expect(
      channel.exclusive(callback, { timeout: 0 })
    ).rejects.toThrow("finite positive number");
    expect(callback).not.toHaveBeenCalled();
  });
});
