import type { CommandTransport } from "../../src/ts/commandTransport";

declare const transport: CommandTransport;

const accepted = transport.send("mdi", ["G1 X10"]);
accepted.accepted.then((result) => result.serial);

const completed = transport.send("runProgram", [0], {
  tracking: "completion",
  completionTimeout: 5000,
});
completed.completed?.then((status) => status);

transport.send("setTool", [{ toolNo: 1 }], { tracking: "completion" });

// @ts-expect-error Unknown native commands are rejected at compile time.
transport.send("notACommand", []);

// @ts-expect-error Tracking mode is a closed set.
transport.send("mdi", ["G0 X0"], { tracking: "pretty" });
