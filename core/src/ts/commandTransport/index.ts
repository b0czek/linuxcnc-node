import { RcsStatus } from "@linuxcnc-node/types";
import { addon } from "../constants";
import type { NapiCommandChannelInstance } from "../native_type_interfaces";
import { StatusCoordinator } from "./statusCoordinator";
import type {
  CommandAccepted,
  CommandTransportHandle,
  CommandTransportOptions,
  NativeCommandName,
} from "./types";

export type {
  CommandAccepted,
  CommandTracking,
  CommandTransportHandle,
  CommandTransportOptions,
  NativeCommandName,
} from "./types";

interface NativeSentResult {
  serial: number;
}

const LOCAL_COMMANDS = new Set<NativeCommandName>(["setTool"]);

export class CommandTransport {
  private readonly nativeInstance: NapiCommandChannelInstance;
  private readonly coordinator: StatusCoordinator;
  private disconnected = false;

  constructor() {
    this.nativeInstance = new addon.NativeCommandChannel({
      waitMode: "sent",
    });
    this.coordinator = new StatusCoordinator(this.nativeInstance);
  }

  getSerial(): number {
    return this.nativeInstance.serial;
  }

  send(
    name: NativeCommandName,
    args: readonly unknown[] = [],
    options: CommandTransportOptions = {}
  ): CommandTransportHandle {
    if (this.disconnected) {
      return rejectedHandle(new Error("Command transport disconnected."));
    }

    if (LOCAL_COMMANDS.has(name)) {
      return this.sendLocal(name, args, options);
    }

    const tracking = options.tracking ?? "acceptance";
    const nativeResult = this.dispatchNative(name, args);
    if (nativeResult instanceof Error) {
      return rejectedHandle(nativeResult);
    }

    let ticket: ReturnType<StatusCoordinator["track"]> | undefined;
    let canceled: Error | undefined;
    const accepted = Promise.resolve(nativeResult).then((result) => {
      const serial = extractSerial(result);
      ticket = this.coordinator.track(
        serial,
        tracking === "completion",
        options.completionTimeout
      );
      if (canceled) ticket.cancel(canceled);
      return ticket.accepted;
    }).then((value) => value);

    const completed =
      tracking === "completion"
        ? Promise.resolve(nativeResult)
            .then(() => ticket?.completed)
            .then((completion) => {
              if (!completion) {
                throw new Error("Command completion tracking was not created.");
              }
              return completion;
            })
            .then((value) => value)
        : undefined;

    const handle: CommandTransportHandle = {
      accepted,
      serial: accepted.then((result) => result.serial),
      completed,
      cancel: (reason) => {
        canceled = reason;
        ticket?.cancel(reason);
      },
    };
    void handle.serial.catch(() => undefined);
    void handle.completed?.catch(() => undefined);
    return handle;
  }

  destroy(): void {
    this.disconnect();
  }

  disconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    const error = new Error("Command transport disconnected.");
    this.coordinator.stop(error);
    this.nativeInstance.disconnect();
  }

  private sendLocal(
    name: NativeCommandName,
    args: readonly unknown[],
    options: CommandTransportOptions
  ): CommandTransportHandle {
    const nativeResult = this.dispatchNative(name, args);
    if (nativeResult instanceof Error) {
      return rejectedHandle(nativeResult);
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const nativeCompletion = Promise.resolve(nativeResult).then((status) => {
      if (status !== RcsStatus.DONE) {
        throw new Error(
          `Local command failed with RCS status: ${
            RcsStatus[status as RcsStatus] || String(status)
          }`
        );
      }
      return RcsStatus.DONE;
    });
    const timeoutPromise =
      options.completionTimeout === undefined
        ? new Promise<never>(() => undefined)
        : new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error("Local command completion timed out.")),
              options.completionTimeout
            );
            timeoutHandle.unref?.();
          });
    const completed = Promise.race([nativeCompletion, timeoutPromise]).finally(
      () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    );
    const accepted = completed.then<CommandAccepted>(() => ({
      status: RcsStatus.DONE,
      serial: null,
    }));
    const handle: CommandTransportHandle = {
      accepted,
      serial: accepted.then((result) => result.serial),
      completed: options.tracking === "completion" ? completed : undefined,
      cancel: () => undefined,
    };
    void handle.serial.catch(() => undefined);
    void handle.completed?.catch(() => undefined);
    return handle;
  }

  private dispatchNative(
    name: NativeCommandName,
    args: readonly unknown[]
  ): unknown | Error {
    const nativeMethod = (
      this.nativeInstance as unknown as Record<
        NativeCommandName,
        (...methodArgs: unknown[]) => unknown
      >
    )[name];
    if (typeof nativeMethod !== "function") {
      return new Error(`Unknown native command: ${String(name)}`);
    }

    try {
      return nativeMethod.apply(this.nativeInstance, [...args]);
    } catch (error: unknown) {
      return nativeDispatchError(error);
    }
  }
}

function rejectedHandle(error: Error): CommandTransportHandle {
  const rejected = Promise.reject(error);
  void rejected.catch(() => undefined);
  return {
    accepted: rejected,
    serial: rejected,
    completed: rejected,
    cancel: () => undefined,
  };
}

function extractSerial(result: unknown): number {
  if (typeof result === "number") return result;
  if (
    typeof result === "object" &&
    result !== null &&
    "serial" in result &&
    typeof (result as NativeSentResult).serial === "number"
  ) {
    return (result as NativeSentResult).serial;
  }
  return NaN;
}

function nativeDispatchError(error: unknown): Error {
  return new Error(
    `Command native dispatch failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}
