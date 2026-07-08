import { RcsStatus } from "@linuxcnc-node/types";
import type {
  CommandStatusSnapshot,
  NapiCommandChannelInstance,
} from "../native_type_interfaces";
import type { CommandAccepted } from "./types";

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

export interface CoordinatorTicket {
  accepted: Promise<CommandAccepted>;
  completed?: Promise<RcsStatus>;
  cancel(reason: Error): void;
}

interface TrackedCommand {
  id: number;
  serial: number;
  acceptanceDeadline: number;
  completionTimeout?: number;
  completionDeadline?: number;
  acceptanceObserved: boolean;
  accepted: Deferred<CommandAccepted>;
  completed?: Deferred<RcsStatus>;
}

const DEFAULT_ACCEPTANCE_TIMEOUT = 1000;
const DEFAULT_POLL_INTERVAL = 10;

export class StatusCoordinator {
  private readonly tracked = new Map<number, TrackedCommand>();
  private nextId = 1;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped?: Error;

  constructor(
    private readonly native: NapiCommandChannelInstance,
    private readonly acceptanceTimeout = DEFAULT_ACCEPTANCE_TIMEOUT,
    private readonly pollInterval = DEFAULT_POLL_INTERVAL
  ) {}

  track(
    serial: number,
    completionSensitive: boolean,
    completionTimeout?: number
  ): CoordinatorTicket {
    if (this.stopped) {
      const rejected = Promise.reject(this.stopped);
      void rejected.catch(() => undefined);
      return {
        accepted: rejected,
        completed: completionSensitive ? rejected : undefined,
        cancel: () => undefined,
      };
    }
    if (!Number.isInteger(serial) || serial <= 0) {
      throw new Error(`Native command returned invalid serial: ${serial}`);
    }

    const accepted = new Deferred<CommandAccepted>();
    const completed = completionSensitive
      ? new Deferred<RcsStatus>()
      : undefined;
    const command: TrackedCommand = {
      id: this.nextId++,
      serial,
      acceptanceDeadline: Date.now() + this.acceptanceTimeout,
      completionTimeout,
      acceptanceObserved: false,
      accepted,
      completed,
    };
    this.tracked.set(command.id, command);
    this.schedule(0);

    return {
      accepted: accepted.promise,
      completed: completed?.promise,
      cancel: (reason) => this.cancel(command.id, reason),
    };
  }

  stop(reason = new Error("Command transport disconnected.")): void {
    if (this.stopped) return;
    this.stopped = reason;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    for (const command of this.tracked.values()) {
      command.accepted.reject(reason);
      command.completed?.reject(reason);
    }
    this.tracked.clear();
  }

  private cancel(id: number, reason: Error): void {
    const command = this.tracked.get(id);
    if (!command) return;
    this.tracked.delete(id);
    command.accepted.reject(reason);
    command.completed?.reject(reason);
  }

  private schedule(delay: number): void {
    if (this.timer || this.stopped || this.tracked.size === 0) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.poll();
    }, delay);
  }

  private poll(): void {
    if (this.stopped || this.tracked.size === 0) return;

    let snapshot: CommandStatusSnapshot | undefined;
    try {
      snapshot = this.native.getStatusSnapshot();
    } catch {
      // A transient NML read failure is handled by the existing deadlines.
    }

    const now = Date.now();
    for (const command of [...this.tracked.values()]) {
      if (
        !command.acceptanceObserved &&
        snapshot &&
        snapshot.echoSerial >= command.serial
      ) {
        command.acceptanceObserved = true;
        command.accepted.resolve({
          status: RcsStatus.DONE,
          serial: command.serial,
        });
        if (!command.completed) {
          this.tracked.delete(command.id);
          continue;
        }
        if (command.completionTimeout !== undefined) {
          command.completionDeadline = now + command.completionTimeout;
        }
      }

      if (!command.acceptanceObserved && now >= command.acceptanceDeadline) {
        const error = new Error(
          `Command acceptance timed out for serial ${command.serial}.`
        );
        this.tracked.delete(command.id);
        command.accepted.reject(error);
        command.completed?.reject(error);
        continue;
      }

      if (
        command.acceptanceObserved &&
        command.completed &&
        snapshot &&
        (snapshot.status === RcsStatus.DONE ||
          snapshot.status === RcsStatus.ERROR)
      ) {
        this.tracked.delete(command.id);
        command.completed.resolve(snapshot.status);
        continue;
      }

      if (
        command.acceptanceObserved &&
        command.completed &&
        command.completionDeadline !== undefined &&
        now >= command.completionDeadline
      ) {
        const error = new Error(
          `Command completion timed out for serial ${command.serial}.`
        );
        this.tracked.delete(command.id);
        command.completed.reject(error);
      }
    }

    this.schedule(this.pollInterval);
  }
}
