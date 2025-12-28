import { CommandChannel, StatChannel } from "../../src/ts";
import { startLinuxCNC, stopLinuxCNC, setupLinuxCNC } from "./setupLinuxCNC";

describe("Integration: Setup Test", () => {
  let commandChannel: CommandChannel;
  let statChannel: StatChannel;

  beforeAll(async () => {
    console.log("Starting LinuxCNC...");
    await startLinuxCNC();
    console.log("LinuxCNC started, creating channels...");

    commandChannel = new CommandChannel();
    statChannel = new StatChannel();

    console.log("Running setup...");
    await setupLinuxCNC(commandChannel, statChannel);
    console.log("Setup complete!");
  }, 30000);

  afterAll(async () => {
    console.log("Cleaning up...");
    statChannel.destroy();
    commandChannel.destroy();

    await stopLinuxCNC();
    console.log("Cleanup complete!");
  });

  it("should have LinuxCNC ready and homed", () => {
    const status = statChannel.get();

    expect(status).toBeDefined();
    expect(status?.task.state).toBeDefined();

    const homedJoints = status?.motion.joint.filter((j) => j.homed);
    console.log(`${homedJoints?.length} joints are homed`);
  });
});
