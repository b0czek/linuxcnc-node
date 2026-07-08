import { RcsStatus } from "@linuxcnc-node/types";
export type { NativeCommandName } from "@linuxcnc-node/types";

export type CommandTracking = "acceptance" | "completion";

export interface CommandAccepted {
  status: RcsStatus.DONE;
  serial: number | null;
}

export interface CommandTransportOptions {
  tracking?: CommandTracking;
  completionTimeout?: number;
}

export interface CommandTransportHandle {
  accepted: Promise<CommandAccepted>;
  serial: Promise<number | null>;
  completed?: Promise<RcsStatus>;
  cancel(reason: Error): void;
}
