import { TaskMode, TaskState } from "@linuxcnc-node/types";
import type { CommandChannelV2 } from "../../src/ts/commandChannelV2";

declare const channel: CommandChannelV2;

channel.setRapidRate(0.5);
channel.setOptionalStop(true);
channel.setBlockDelete(true);
channel.stop();
channel.setState(TaskState.OFF);
channel.exclusive(() => undefined, {
  locks: ["feedControls", "rapidOverride", "blockDelete"],
});

// @ts-expect-error Exclusive commands are not top-level methods.
channel.mdi("G1 X10");
// @ts-expect-error ON is completion-sensitive and must be exclusive.
channel.setState(TaskState.ON);
// @ts-expect-error Locks must name declared immediate resources.
channel.exclusive(() => undefined, { locks: ["notAResource"] });

channel.exclusive((command) => {
  command.setTaskMode(TaskMode.MDI);
  command.mdi("G1 X10", { timeout: 5000 });
  // @ts-expect-error Locks are transaction options, not command options.
  command.mdi("G1 X10", { locks: ["feedControls"] });
  command.runProgram({ timeout: 5000 });
  command.runProgram(10, { timeout: 5000 });
  command.setState(TaskState.ON);
  const rapid = command.setRapidRate(0.5);
  // @ts-expect-error Immediate command handles expose acceptance only.
  rapid.completed;

  // @ts-expect-error Preemptive methods are not on the exclusive facade.
  command.stop();
  // @ts-expect-error OFF is preemptive and must be top-level.
  command.setState(TaskState.OFF);
});
