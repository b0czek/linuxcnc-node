import { RcsStatus } from "@linuxcnc-node/types";
import type { NapiCommandChannelInstance } from "../native_type_interfaces";

type NativeMethodName = {
  [K in keyof NapiCommandChannelInstance]:
    NapiCommandChannelInstance[K] extends (...args: any[]) => unknown
      ? K
      : never;
}[keyof NapiCommandChannelInstance];

export type NativeCommandName = Exclude<
  NativeMethodName,
  "disconnect" | "waitComplete" | "getStatusSnapshot"
>;

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
