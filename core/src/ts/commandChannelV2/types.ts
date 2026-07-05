import { RcsStatus } from "@linuxcnc-node/types";
import type { ImmediateLockResource } from "./commandPolicy";

export type { ImmediateLockResource } from "./commandPolicy";

export interface CommandAccepted {
  status: RcsStatus.DONE;
  serial: number | null;
}

export interface ExclusiveOptions {
  /** Completion timeout in milliseconds. */
  timeout?: number;
  /** Immediate resources locked against competing top-level commands. */
  locks?: readonly ImmediateLockResource[];
}

export interface ExclusiveCommandOptions {
  /** Completion timeout in milliseconds. */
  timeout?: number;
}

export interface CommandHandle extends PromiseLike<CommandAccepted> {
  accepted: Promise<CommandAccepted>;
  serial: Promise<number | null>;
}

export interface ExclusiveCommandHandle extends CommandHandle {
  completed: Promise<RcsStatus>;
}
