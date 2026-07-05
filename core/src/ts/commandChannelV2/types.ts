import { RcsStatus } from "@linuxcnc-node/types";

export interface CommandAccepted {
  status: RcsStatus.DONE;
  serial: number | null;
}

export interface ExclusiveOptions {
  /** Completion timeout in milliseconds. */
  timeout?: number;
}

export type ExclusiveCommandOptions = ExclusiveOptions;

export interface CommandHandle extends PromiseLike<CommandAccepted> {
  accepted: Promise<CommandAccepted>;
  serial: Promise<number | null>;
}

export interface ExclusiveCommandHandle extends CommandHandle {
  completed: Promise<RcsStatus>;
}
