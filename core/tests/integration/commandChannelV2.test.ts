import {
  CommandChannel,
  CommandChannelV2,
  StatChannel,
} from "../../src/ts";
import type { ExclusiveCommandHandle } from "../../src/ts";
import { PositionIndex, RcsStatus, TaskMode } from "@linuxcnc-node/types";
import path from "node:path";
import { startLinuxCNC, stopLinuxCNC, setupLinuxCNC } from "./setupLinuxCNC";

describe("Integration: CommandChannelV2 scheduler", () => {
  let setupCommandChannel: CommandChannel;
  let commandChannel: CommandChannelV2;
  let statChannel: StatChannel;

  beforeAll(async () => {
    await startLinuxCNC();

    setupCommandChannel = new CommandChannel();
    commandChannel = new CommandChannelV2();
    statChannel = new StatChannel();

    await setupLinuxCNC(setupCommandChannel, statChannel);
  }, 30000);

  afterAll(async () => {
    statChannel?.destroy();
    commandChannel?.destroy();
    setupCommandChannel?.destroy();

    await stopLinuxCNC();
  });

  it("auto-drains exclusive commands sequentially", async () => {
    await commandChannel.exclusive(
      (command) => {
        command.setTaskMode(TaskMode.MDI);
        command.mdi("G90 G0 X1");
        command.mdi("G90 G0 X2");
      },
      { timeout: 5000 }
    );

    await waitForStatus(
      statChannel,
      (status) =>
        status.task.mode === TaskMode.MDI &&
        Math.abs(status.motion.traj.position[PositionIndex.X] - 2) < 0.001,
      "MDI mode with final X position at 2"
    );
  });

  it("accepts immediate overrides while an exclusive MDI remains active", async () => {
    let dwell!: ExclusiveCommandHandle;
    const transaction = commandChannel.exclusive(async (command) => {
      dwell = command.mdi("G4 P1");
      await dwell;
      await command.setRapidRate(0.5);
    });
    await dwell;
    await waitForStatus(
      statChannel,
      (status) => status.state === RcsStatus.EXEC,
      "aggregate task status to enter EXEC during dwell"
    );

    await waitForStatus(
      statChannel,
      (status) => Math.abs(status.motion.traj.rapidRateOverride - 0.5) < 0.001,
      "rapid override to change during active dwell"
    );

    let completed = false;
    void transaction.then(() => {
      completed = true;
    });
    await delay(50);
    expect(completed).toBe(false);
    await transaction;
  });

  it("preempts active work and accepts a new exclusive transaction afterward", async () => {
    let dwell!: ExclusiveCommandHandle;
    const active = commandChannel.exclusive((command) => {
      dwell = command.mdi("G4 P1");
    });
    await dwell;
    const activeRejection = expect(active).rejects.toThrow(
      "preempted by stop"
    );

    await commandChannel.stop();
    await activeRejection;

    await commandChannel.exclusive((command) => {
      command.mdi("G90 G0 X3");
    });
    await waitForStatus(
      statChannel,
      (status) =>
        Math.abs(status.motion.traj.position[PositionIndex.X] - 3) < 0.001,
      "new exclusive move to complete after preemption"
    );
  });

  it("keeps the program-open barrier isolated from immediate commands", async () => {
    const programPath = path.resolve(
      __dirname,
      "../linuxcnc-sim/program-open.ngc"
    );
    const opened = commandChannel.exclusive((command) => {
      command.programOpen(programPath);
    });

    await commandChannel.setFeedRate(0.75);
    await waitForStatus(
      statChannel,
      (status) => Math.abs(status.motion.traj.feedRateOverride - 0.75) < 0.001,
      "feed override to change while program-open is pending"
    );
    await opened;
    await waitForStatus(
      statChannel,
      (status) => path.basename(status.task.file) === "program-open.ngc",
      "program-open.ngc to be loaded"
    );
  });
});

async function waitForStatus(
  statChannel: StatChannel,
  predicate: (status: NonNullable<ReturnType<StatChannel["get"]>>) => boolean,
  description: string,
  timeout = 3000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const status = statChannel.get();
    if (status && predicate(status)) {
      return;
    }
    await delay(25);
  }
  throw new Error(`Timeout waiting for ${description}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
