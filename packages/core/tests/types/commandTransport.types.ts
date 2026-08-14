import type { CommandTransport } from "../../src/ts/commandTransport";
import { PositionIndex } from "@linuxcnc-node/types";
import type { ToolEntry } from "@linuxcnc-node/types";

declare const transport: CommandTransport;
declare const toolEntry: ToolEntry;

toolEntry.wearOffset[PositionIndex.X].toFixed();

const accepted = transport.send("mdi", ["G1 X10"]);
accepted.accepted.then((result) => result.serial);

const completed = transport.send("runProgram", [0], {
  tracking: "completion",
  completionTimeout: 5000,
});
completed.completed?.then((status) => status);

transport.send("setTool", [{ toolNo: 1 }], { tracking: "completion" });
transport.send(
  "setTool",
  [{ toolNo: 1, wearOffset: { [PositionIndex.Z]: -0.01 } }],
  { tracking: "completion" }
);
transport.send("deleteTool", [1], { tracking: "completion" });

// @ts-expect-error Unknown native commands are rejected at compile time.
transport.send("notACommand", []);

// @ts-expect-error Tracking mode is a closed set.
transport.send("mdi", ["G0 X0"], { tracking: "pretty" });
