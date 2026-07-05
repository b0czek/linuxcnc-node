import { RcsStatus } from "@linuxcnc-node/types";
import { addon } from "../constants";
import type { NapiCommandChannelInstance } from "../native_type_interfaces";
import {
  applyCommandDefaults,
  commandPolicyCatalog,
  policyForInvocation,
  topLevelCommandNames,
} from "./commandPolicy";
import type {
  CommandName,
  ExclusiveCommandChannel,
  TopLevelCommandChannel,
} from "./commandPolicy";
import {
  AcceptanceHandleImpl,
  CommandHandleImpl,
  CommandScheduler,
} from "./scheduler";
import type { CommandExecution } from "./scheduler";
import { StatusCoordinator } from "./statusCoordinator";
import type {
  CommandAccepted,
  CommandHandle,
  ExclusiveOptions,
} from "./types";

export type {
  CommandAccepted,
  CommandHandle,
  ExclusiveCommandHandle,
  ExclusiveCommandOptions,
  ExclusiveOptions,
  ImmediateLockResource,
} from "./types";
export type { ExclusiveCommandChannel } from "./commandPolicy";
export {
  commandPolicyCatalog,
  immediateLockResourceCatalog,
} from "./commandPolicy";

interface NativeSentResult {
  serial: number;
}

/**
 * Policy-scheduled command API.
 *
 * Top-level commands are immediate or preemptive and await LinuxCNC
 * acceptance. Completion-sensitive commands are available only through
 * `exclusive()`.
 */
export class CommandChannelV2 {
  private readonly nativeInstance: NapiCommandChannelInstance;
  private readonly coordinator: StatusCoordinator;
  private readonly scheduler: CommandScheduler;
  private disconnected = false;

  constructor() {
    this.nativeInstance = new addon.NativeCommandChannel({
      waitMode: "sent",
    });
    this.coordinator = new StatusCoordinator(this.nativeInstance);
    this.scheduler = new CommandScheduler(
      (name, args, timeout) =>
        this.startExclusiveCommand(name, args, timeout),
      (name, args) => this.startImmediateCommand(name, args)
    );
    this.installTopLevelFacade();
  }

  exclusive<T>(
    callback: (command: ExclusiveCommandChannel) => T | Promise<T>,
    options: ExclusiveOptions = {}
  ): Promise<T> {
    return this.scheduler.exclusive(callback, options);
  }

  getSerial(): number {
    return this.nativeInstance.serial;
  }

  destroy(): void {
    this.disconnect();
  }

  disconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    const error = new Error("Command channel disconnected.");
    this.scheduler.stop(error);
    this.coordinator.stop(error);
    this.nativeInstance.disconnect();
  }

  private installTopLevelFacade(): void {
    for (const name of topLevelCommandNames()) {
      Object.defineProperty(this, name, {
        enumerable: false,
        value: (...invocationArgs: unknown[]) => {
          const args = [...invocationArgs];
          applyCommandDefaults(name, args);
          return this.dispatchTopLevel(name, args);
        },
      });
    }
  }

  private dispatchTopLevel(
    name: CommandName,
    args: unknown[]
  ): CommandHandle {
    const policy = policyForInvocation(name, args);
    if (policy === "exclusive" || policy === "exclusive-local") {
      return rejectedHandle(
        new Error(`${name} is available only inside channel.exclusive().`)
      );
    }
    if (policy === "preemptive") {
      this.scheduler.preempt(
        new Error(`Exclusive work was preempted by ${name}.`)
      );
    } else {
      const lockError = this.scheduler.lockErrorForImmediateCommand(name);
      if (lockError) return rejectedHandle(lockError);
    }
    const execution = this.startNativeCommand(name, args, false);
    return new AcceptanceHandleImpl(execution.accepted);
  }

  private startExclusiveCommand(
    name: CommandName,
    args: unknown[],
    timeout?: number
  ): CommandExecution {
    const policy = policyForInvocation(name, args);
    if (policy === "exclusive-local") {
      return this.startLocalCommand(name, args, timeout);
    }
    if (policy !== "exclusive") {
      return rejectedExecution(
        new Error(`${name} is not available on the exclusive command facade.`)
      );
    }
    return this.startNativeCommand(name, args, true, timeout);
  }

  private startImmediateCommand(
    name: CommandName,
    args: unknown[]
  ): CommandExecution {
    const policy = policyForInvocation(name, args);
    if (policy !== "immediate") {
      return rejectedExecution(
        new Error(`${name} is not an immediate command.`)
      );
    }
    return this.startNativeCommand(name, args, false);
  }

  private startNativeCommand(
    name: CommandName,
    args: unknown[],
    completionSensitive: boolean,
    completionTimeout?: number
  ): CommandExecution {
    let canceled: Error | undefined;
    const cancellation = cancellationSignal();
    let ticket:
      | ReturnType<StatusCoordinator["track"]>
      | undefined;

    let nativeResult: unknown;
    try {
      const nativeMethod = this.nativeInstance[name] as unknown as (
        ...methodArgs: unknown[]
      ) => unknown;
      nativeResult = nativeMethod.apply(this.nativeInstance, args);
    } catch (error: unknown) {
      return rejectedExecution(nativeDispatchError(error));
    }

    const ticketPromise = Promise.resolve(nativeResult).then((result) => {
      const serial =
        typeof result === "number"
          ? result
          : typeof result === "object" &&
              result !== null &&
              "serial" in result &&
              typeof (result as NativeSentResult).serial === "number"
            ? (result as NativeSentResult).serial
            : NaN;
      ticket = this.coordinator.track(
        serial,
        completionSensitive,
        completionTimeout
      );
      if (canceled) ticket.cancel(canceled);
      return ticket;
    });

    const trackedAcceptance = ticketPromise.then((tracked) => tracked.accepted);
    const accepted = Promise.race([
      trackedAcceptance,
      cancellation.promise,
    ]);
    const trackedCompletion = completionSensitive
      ? ticketPromise.then((tracked) => tracked.completed!)
      : Promise.resolve(RcsStatus.DONE);
    const completed = completionSensitive
      ? Promise.race([trackedCompletion, cancellation.promise])
      : trackedCompletion;

    return {
      accepted,
      completed,
      cancel: (reason) => {
        canceled = reason;
        cancellation.reject(reason);
        ticket?.cancel(reason);
      },
    };
  }

  private startLocalCommand(
    name: CommandName,
    args: unknown[],
    timeout?: number
  ): CommandExecution {
    const cancellation = cancellationSignal();
    let nativeResult: unknown;
    try {
      const nativeMethod = this.nativeInstance[name] as unknown as (
        ...methodArgs: unknown[]
      ) => unknown;
      nativeResult = nativeMethod.apply(this.nativeInstance, args);
    } catch (error: unknown) {
      return rejectedExecution(nativeDispatchError(error));
    }

    const nativeCompletion = Promise.resolve(nativeResult).then((status) => {
      if (status !== RcsStatus.DONE) {
        throw new Error(
          `Command completion failed with RCS status: ${
            RcsStatus[status as RcsStatus] || String(status)
          }`
        );
      }
      return RcsStatus.DONE;
    });
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise =
      timeout === undefined
        ? new Promise<never>(() => undefined)
        : new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () =>
                reject(
                  new Error("Local exclusive command completion timed out.")
                ),
              timeout
            );
            timeoutHandle.unref?.();
          });
    const completed = Promise.race([
      nativeCompletion,
      cancellation.promise,
      timeoutPromise,
    ]).finally(() => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    });
    const accepted = completed.then<CommandAccepted>(() => ({
      status: RcsStatus.DONE,
      serial: null,
    }));
    return {
      accepted,
      completed,
      cancel: cancellation.reject,
    };
  }
}

export interface CommandChannelV2 extends TopLevelCommandChannel {}

function rejectedExecution(error: Error): CommandExecution {
  const rejected = Promise.reject(error);
  void rejected.catch(() => undefined);
  return {
    accepted: rejected,
    completed: rejected,
    cancel: () => undefined,
  };
}

function rejectedHandle(error: Error): CommandHandle {
  const execution = rejectedExecution(error);
  return new AcceptanceHandleImpl(execution.accepted);
}

function nativeDispatchError(error: unknown): Error {
  return new Error(
    `Command native dispatch failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

function cancellationSignal(): {
  promise: Promise<never>;
  reject(reason: Error): void;
} {
  let rejectPromise!: (reason: Error) => void;
  let rejected = false;
  const promise = new Promise<never>((_, reject) => {
    rejectPromise = reject;
  });
  void promise.catch(() => undefined);
  return {
    promise,
    reject: (reason) => {
      if (rejected) return;
      rejected = true;
      rejectPromise(reason);
    },
  };
}
