import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { PositionIndex, RcsStatus } from "@linuxcnc-node/types";
import { CommandChannel, StatChannel } from "../../src/ts";
import { startLinuxCNC, stopLinuxCNC } from "./setupLinuxCNC";

describe("Integration: SetTool", () => {
  const toolTablePath = path.join(__dirname, "../linuxcnc-sim/sim.tbl");
  let originalToolTable: Buffer;
  let commandChannel: CommandChannel;
  let statChannel: StatChannel;

  beforeAll(async () => {
    originalToolTable = await readFile(toolTablePath);
    await startLinuxCNC();
    commandChannel = new CommandChannel();
    statChannel = new StatChannel();
    expect(path.resolve(statChannel.task?.iniFilename ?? "")).toBe(
      path.resolve(__dirname, "../linuxcnc-sim/sim.ini")
    );
  }, 30000);

  afterAll(async () => {
    statChannel?.destroy();
    commandChannel?.destroy();
    await stopLinuxCNC();
    await writeFile(toolTablePath, originalToolTable);
  });

  it("persists offsets supplied as an indexed Position", async () => {
    const offset = Float64Array.from([
      1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8, 9.9,
    ]);

    await expect(
      commandChannel.setTool({ toolNo: 6, offset })
    ).resolves.toBe(RcsStatus.DONE);

    // A later scalar-only update must preserve the offsets written above.
    await expect(
      commandChannel.setTool({ toolNo: 6, diameter: 12.5 })
    ).resolves.toBe(RcsStatus.DONE);

    const tool = await waitForTool(
      statChannel,
      6,
      (entry) =>
        entry.diameter === 12.5 && entry.offset[PositionIndex.Z] === 3.3
    );
    expect(tool.diameter).toBe(12.5);
    expect(Array.from(tool.offset)).toEqual(Array.from(offset));
    expect(tool.offset[PositionIndex.Z]).toBe(3.3);
  });

  it("deletes a tool from memory and the configured tool table", async () => {
    await expect(
      commandChannel.setTool({ toolNo: 7, pocketNo: 7, diameter: 7.5 })
    ).resolves.toBe(RcsStatus.DONE);
    await waitForTool(
      statChannel,
      7,
      (entry) => entry.pocketNo === 7 && entry.diameter === 7.5
    );

    const persistedBeforeDelete = await readFile(toolTablePath, "utf8");
    expect(persistedBeforeDelete).toMatch(/^T\s*7(?:\s|$)/m);

    const toolIndex = statChannel.toolTable?.findIndex(
      (entry) => entry.toolNo === 7
    );
    expect(toolIndex).toBeDefined();
    expect(toolIndex).toBeGreaterThanOrEqual(0);

    await expect(commandChannel.deleteTool(7)).resolves.toBe(RcsStatus.DONE);

    const deletedTool = await waitForToolIndex(
      statChannel,
      toolIndex as number,
      (entry) => entry.toolNo === -1
    );
    expect(deletedTool.toolNo).toBe(-1);

    const persistedToolTable = await readFile(toolTablePath, "utf8");
    expect(persistedToolTable).not.toMatch(/^T\s*7(?:\s|$)/m);

    await expect(commandChannel.deleteTool(7)).rejects.toThrow(
      "Tool not found: 7"
    );
  });
});

async function waitForTool(
  statChannel: StatChannel,
  toolNo: number,
  matches: (tool: NonNullable<StatChannel["toolTable"]>[number]) => boolean,
  timeout = 2000
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const tool = statChannel.toolTable?.find((entry) => entry.toolNo === toolNo);
    if (tool && matches(tool)) return tool;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for tool ${toolNo}`);
}

async function waitForToolIndex(
  statChannel: StatChannel,
  toolIndex: number,
  matches: (tool: NonNullable<StatChannel["toolTable"]>[number]) => boolean,
  timeout = 2000
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const tool = statChannel.toolTable?.[toolIndex];
    if (tool && matches(tool)) return tool;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for tool-table index ${toolIndex}`);
}
