import { RcsStatus } from "@linuxcnc-node/types";
import type { CommandName, ExclusiveCommandChannel } from "./commandPolicy";
import {
  applyCommandDefaults,
  exclusiveCommandNames,
  immediateLockResourceForCommand,
  immediateCommandNames,
  takeExclusiveOptions,
  validateImmediateLockResources,
} from "./commandPolicy";
import type { ImmediateLockResource } from "./commandPolicy";
import type {
  CommandAccepted,
  ExclusiveCommandHandle,
  ExclusiveOptions,
} from "./types";

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T | PromiseLike<T>) => void;
  reject!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    void this.promise.catch(() => undefined);
  }
}

export interface CommandExecution {
  accepted: Promise<CommandAccepted>;
  completed: Promise<RcsStatus>;
  cancel(reason: Error): void;
}

export type StartCommand = (
  name: CommandName,
  args: unknown[],
  completionTimeout?: number
) => CommandExecution;

export type StartImmediateCommand = (
  name: CommandName,
  args: unknown[]
) => CommandExecution;

export class AcceptanceHandleImpl {
  readonly serial: Promise<number | null>;

  constructor(readonly accepted: Promise<CommandAccepted>) {
    this.serial = accepted.then((result) => result.serial);
    void this.serial.catch(() => undefined);
  }

  then<TResult1 = CommandAccepted, TResult2 = never>(
    onfulfilled?:
      | ((value: CommandAccepted) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.accepted.then(onfulfilled, onrejected);
  }
}

export class CommandHandleImpl
  extends AcceptanceHandleImpl
  implements ExclusiveCommandHandle
{
  constructor(
    accepted: Promise<CommandAccepted>,
    readonly completed: Promise<RcsStatus>
  ) {
    super(accepted);
  }
}

class ScheduledOperation {
  private readonly acceptedDeferred = new Deferred<CommandAccepted>();
  private readonly completedDeferred = new Deferred<RcsStatus>();
  private execution?: CommandExecution;
  private started = false;

  readonly handle: AcceptanceHandleImpl | CommandHandleImpl;

  constructor(
    private readonly start: () => CommandExecution,
    private readonly barrier: "completion" | "acceptance"
  ) {
    this.handle =
      barrier === "completion"
        ? new CommandHandleImpl(
            this.acceptedDeferred.promise,
            this.completedDeferred.promise
          )
        : new AcceptanceHandleImpl(this.acceptedDeferred.promise);
  }

  async run(): Promise<void> {
    this.started = true;
    try {
      this.execution = this.start();
      void this.execution.accepted.then(
        (accepted) => this.acceptedDeferred.resolve(accepted),
        (error) => this.acceptedDeferred.reject(error)
      );
      if (this.barrier === "acceptance") {
        await this.execution.accepted;
        this.completedDeferred.resolve(RcsStatus.DONE);
        return;
      }
      const status = await this.execution.completed;
      if (status !== RcsStatus.DONE) {
        throw new Error(
          `Command completion failed with RCS status: ${
            RcsStatus[status] || status
          }`
        );
      }
      this.completedDeferred.resolve(status);
    } catch (error: unknown) {
      this.acceptedDeferred.reject(error);
      this.completedDeferred.reject(error);
      throw error;
    }
  }

  abort(reason: Error, includeActive: boolean): void {
    if (this.started) {
      if (includeActive) {
        this.execution?.cancel(reason);
        this.acceptedDeferred.reject(reason);
        this.completedDeferred.reject(reason);
      }
      return;
    }
    this.acceptedDeferred.reject(reason);
    this.completedDeferred.reject(reason);
  }
}

class ExclusiveTransaction<T> {
  private readonly operations: ScheduledOperation[] = [];
  private readonly resultDeferred = new Deferred<T>();
  private readonly changeDeferreds = new Set<Deferred<void>>();
  private active?: ScheduledOperation;
  private callbackSettled = false;
  private callbackValue?: T;
  private callbackError?: unknown;
  private closed = false;
  canceled = false;

  readonly result = this.resultDeferred.promise;
  readonly facade: ExclusiveCommandChannel;

  constructor(
    private readonly callback: (
      command: ExclusiveCommandChannel
    ) => T | Promise<T>,
    private readonly startCommand: StartCommand,
    private readonly startImmediateCommand: StartImmediateCommand,
    private readonly defaultTimeout: number | undefined,
    private readonly lockResources: ReadonlySet<ImmediateLockResource>
  ) {
    const facade: Partial<ExclusiveCommandChannel> = {};
    for (const name of exclusiveCommandNames()) {
      Object.defineProperty(facade, name, {
        enumerable: true,
        value: (...invocationArgs: unknown[]) => {
          const args = [...invocationArgs];
          const options = takeExclusiveOptions(args);
          applyCommandDefaults(name, args);
          return this.enqueue(name, args, options?.timeout);
        },
      });
    }
    for (const name of immediateCommandNames()) {
      Object.defineProperty(facade, name, {
        enumerable: true,
        value: (...invocationArgs: unknown[]) => {
          const args = [...invocationArgs];
          applyCommandDefaults(name, args);
          return this.enqueueImmediate(name, args);
        },
      });
    }
    this.facade = facade as ExclusiveCommandChannel;
  }

  startCallback(): void {
    let result: T | Promise<T>;
    try {
      result = this.callback(this.facade);
    } catch (error: unknown) {
      this.onCallbackRejected(error);
      return;
    }
    void Promise.resolve(result).then(
      (value) => {
        this.callbackValue = value;
        this.callbackSettled = true;
        this.notify();
      },
      (error) => this.onCallbackRejected(error)
    );
  }

  takeOperation(): ScheduledOperation | undefined {
    this.active = this.operations.shift();
    return this.active;
  }

  clearActive(): void {
    this.active = undefined;
  }

  hasOperation(): boolean {
    return this.operations.length > 0;
  }

  isSettled(): boolean {
    return this.callbackSettled;
  }

  locksImmediateCommand(name: CommandName): boolean {
    const resource = immediateLockResourceForCommand(name);
    return resource !== undefined && this.lockResources.has(resource);
  }

  async waitForChange(): Promise<void> {
    if (this.hasOperation() || this.callbackSettled) return;
    const changed = new Deferred<void>();
    this.changeDeferreds.add(changed);
    await changed.promise;
  }

  finish(): void {
    this.closed = true;
    if (this.callbackError !== undefined) {
      this.resultDeferred.reject(this.callbackError);
    } else {
      this.resultDeferred.resolve(this.callbackValue as T);
    }
  }

  failOperation(error: unknown): void {
    this.closed = true;
    this.abortPending(
      new Error("Exclusive transaction canceled after a command failure.")
    );
    this.resultDeferred.reject(
      this.callbackError !== undefined ? this.callbackError : error
    );
  }

  cancel(reason: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.canceled = true;
    this.active?.abort(reason, true);
    this.abortPending(reason);
    this.resultDeferred.reject(reason);
    this.notify();
  }

  private enqueue(
    name: CommandName,
    args: unknown[],
    commandTimeout?: number
  ): ExclusiveCommandHandle {
    const timeout = validateTimeout(commandTimeout ?? this.defaultTimeout);
    const operation = new ScheduledOperation(
      () => this.startCommand(name, args, timeout),
      "completion"
    );
    if (this.closed || this.callbackError !== undefined) {
      operation.abort(
        new Error("Exclusive transaction is no longer accepting commands."),
        false
      );
      return operation.handle as ExclusiveCommandHandle;
    }
    this.operations.push(operation);
    this.notify();
    return operation.handle as ExclusiveCommandHandle;
  }

  private enqueueImmediate(
    name: CommandName,
    args: unknown[]
  ): AcceptanceHandleImpl {
    if (
      this.active !== undefined &&
      this.operations.length === 0 &&
      !this.closed &&
      this.callbackError === undefined
    ) {
      const execution = this.startImmediateCommand(name, args);
      return new AcceptanceHandleImpl(execution.accepted);
    }

    const operation = new ScheduledOperation(
      () => this.startImmediateCommand(name, args),
      "acceptance"
    );
    if (this.closed || this.callbackError !== undefined) {
      operation.abort(
        new Error("Exclusive transaction is no longer accepting commands."),
        false
      );
      return operation.handle as AcceptanceHandleImpl;
    }
    this.operations.push(operation);
    this.notify();
    return operation.handle as AcceptanceHandleImpl;
  }

  private onCallbackRejected(error: unknown): void {
    this.callbackError = error;
    this.callbackSettled = true;
    this.abortPending(
      new Error("Exclusive transaction canceled by its callback failure.")
    );
    this.notify();
  }

  private abortPending(reason: Error): void {
    let operation: ScheduledOperation | undefined;
    while ((operation = this.operations.shift()) !== undefined) {
      operation.abort(reason, false);
    }
  }

  private notify(): void {
    for (const changed of this.changeDeferreds) changed.resolve();
    this.changeDeferreds.clear();
  }
}

export class CommandScheduler {
  private static readonly DEFAULT_COMPLETION_TIMEOUT = 5000;
  private activeTransaction?: ExclusiveTransaction<unknown>;
  private pumpScheduled = false;
  private pumping = false;
  private stopped?: Error;

  constructor(
    private readonly startCommand: StartCommand,
    private readonly startImmediateCommand: StartImmediateCommand
  ) {}

  exclusive<T>(
    callback: (command: ExclusiveCommandChannel) => T | Promise<T>,
    options: ExclusiveOptions = {}
  ): Promise<T> {
    if (this.stopped) return Promise.reject(this.stopped);
    let timeout: number | undefined;
    let locks: ImmediateLockResource[];
    try {
      timeout = validateTimeout(
        options.timeout ?? CommandScheduler.DEFAULT_COMPLETION_TIMEOUT
      );
      locks = validateImmediateLockResources(options.locks);
    } catch (error: unknown) {
      return Promise.reject(error);
    }
    if (this.activeTransaction) {
      return Promise.reject(
        new Error("Exclusive transaction already active.")
      );
    }
    const transaction = new ExclusiveTransaction(
      callback,
      this.startCommand,
      this.startImmediateCommand,
      timeout,
      new Set(locks)
    );
    this.activeTransaction = transaction as ExclusiveTransaction<unknown>;
    transaction.startCallback();
    this.schedulePump();
    return transaction.result;
  }

  preempt(reason: Error): void {
    const transaction = this.activeTransaction;
    this.activeTransaction = undefined;
    transaction?.cancel(reason);
  }

  lockErrorForImmediateCommand(name: CommandName): Error | undefined {
    if (!this.activeTransaction?.locksImmediateCommand(name)) {
      return undefined;
    }
    return new Error(`${name} is locked by active exclusive transaction.`);
  }

  stop(reason = new Error("Command channel disconnected.")): void {
    if (this.stopped) return;
    this.stopped = reason;
    this.preempt(reason);
  }

  private schedulePump(): void {
    if (this.pumping || this.pumpScheduled || this.stopped) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      if (this.pumping || this.stopped) return;
      this.pumping = true;
      void this.pump().finally(() => {
        this.pumping = false;
        if (this.activeTransaction) this.schedulePump();
      });
    });
  }

  private async pump(): Promise<void> {
    while (!this.stopped && this.activeTransaction) {
      const transaction = this.activeTransaction;
      if (transaction.hasOperation()) {
        const operation = transaction.takeOperation()!;
        try {
          await operation.run();
          transaction.clearActive();
        } catch (error: unknown) {
          transaction.clearActive();
          if (!transaction.canceled) {
            transaction.failOperation(error);
            if (this.activeTransaction === transaction) {
              this.activeTransaction = undefined;
            }
          }
        }
        continue;
      }

      if (transaction.isSettled()) {
        if (this.activeTransaction === transaction) {
          this.activeTransaction = undefined;
        }
        transaction.finish();
        continue;
      }

      await transaction.waitForChange();
    }
  }
}

export function validateTimeout(
  timeout: number | undefined
): number | undefined {
  if (
    timeout !== undefined &&
    (!Number.isFinite(timeout) || timeout <= 0)
  ) {
    throw new RangeError("Command timeout must be a finite positive number.");
  }
  return timeout;
}
