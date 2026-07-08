import { CommandChannel, CommandTransport, StatChannel } from "../../src/ts";
import { PositionIndex, RcsStatus, TaskMode } from "@linuxcnc-node/types";
import { startLinuxCNC, stopLinuxCNC, setupLinuxCNC } from "./setupLinuxCNC";

describe("Integration: CommandTransport", () => {
  let setupCommandChannel: CommandChannel;
  let commandTransport: CommandTransport;
  let statChannel: StatChannel;

  beforeAll(async () => {
    await startLinuxCNC();

    setupCommandChannel = new CommandChannel();
    commandTransport = new CommandTransport();
    statChannel = new StatChannel();

    await setupLinuxCNC(setupCommandChannel, statChannel);
  }, 30000);

  afterAll(async () => {
    statChannel?.destroy();
    commandTransport?.destroy();
    setupCommandChannel?.destroy();

    await stopLinuxCNC();
  });

  it("accepts and completes raw MDI commands", async () => {
    await commandTransport.send("setTaskMode", [TaskMode.MDI], {
      tracking: "completion",
      completionTimeout: 5000,
    }).completed;

    const mdi = commandTransport.send("mdi", ["G90 G0 X1"], {
      tracking: "completion",
      completionTimeout: 5000,
    });

    await expect(mdi.accepted).resolves.toMatchObject({
      status: RcsStatus.DONE,
    });
    await expect(mdi.completed).resolves.toBe(RcsStatus.DONE);

    await waitForStatus(
      statChannel,
      (status) =>
        status.task.mode === TaskMode.MDI &&
        Math.abs(status.motion.traj.position[PositionIndex.X] - 1) < 0.001,
      "MDI mode with final X position at 1"
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
  throw new Error(`Timed out waiting for ${description}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
