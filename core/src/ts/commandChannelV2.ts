import { AsyncLocalStorage } from "node:async_hooks";
import { NapiCommandChannelInstance } from "./native_type_interfaces";
import { addon } from "./constants";
import {
  TaskMode,
  TaskState,
  TrajMode,
  RcsStatus,
  DebugFlags,
  RecursivePartial,
  ToolEntry,
} from "@linuxcnc-node/types";

interface NativeCommandAccepted {
  status: RcsStatus;
  serial: number | null;
}

type NativeAcceptedMethod = (
  ...args: unknown[]
) => Promise<NativeCommandAccepted | RcsStatus>;

interface CommandLockContext {
  channel: CommandChannelV2;
  pending: Set<Promise<unknown>>;
}

export interface CommandAccepted {
  status: RcsStatus.DONE;
  serial: number | null;
}

export interface CommandWaitOptions {
  /** Completion timeout in milliseconds. */
  timeout?: number;
}

export interface CommandHandle extends PromiseLike<CommandAccepted> {
  accepted: Promise<CommandAccepted>;
  serial: Promise<number | null>;
}

export interface WaitableCommandHandle extends CommandHandle {
  wait(options?: CommandWaitOptions): Promise<RcsStatus>;
}

export interface LockedCommandChannel {
  setTaskMode(mode: TaskMode): WaitableCommandHandle;
  setState(state: TaskState): WaitableCommandHandle;
  taskPlanSynch(): WaitableCommandHandle;
  resetInterpreter(): WaitableCommandHandle;
  programOpen(filePath: string): WaitableCommandHandle;
  programClose(): WaitableCommandHandle;
  runProgram(startLine?: number): WaitableCommandHandle;
  pauseProgram(): WaitableCommandHandle;
  resumeProgram(): WaitableCommandHandle;
  stepProgram(): WaitableCommandHandle;
  reverseProgram(): WaitableCommandHandle;
  forwardProgram(): WaitableCommandHandle;
  stop(): WaitableCommandHandle;
  abortTask(): WaitableCommandHandle;
  setOptionalStop(enable: boolean): WaitableCommandHandle;
  setBlockDelete(enable: boolean): WaitableCommandHandle;
  mdi(command: string): WaitableCommandHandle;

  setTrajMode(mode: TrajMode): WaitableCommandHandle;
  setMaxVelocity(velocity: number): WaitableCommandHandle;
  setFeedRate(scale: number): WaitableCommandHandle;
  setRapidRate(scale: number): WaitableCommandHandle;
  setSpindleOverride(
    scale: number,
    spindleIndex?: number
  ): WaitableCommandHandle;
  overrideLimits(): WaitableCommandHandle;
  teleopEnable(enable: boolean): WaitableCommandHandle;
  setFeedOverrideEnable(enable: boolean): WaitableCommandHandle;
  setSpindleOverrideEnable(
    enable: boolean,
    spindleIndex?: number
  ): WaitableCommandHandle;
  setFeedHoldEnable(enable: boolean): WaitableCommandHandle;
  setAdaptiveFeedEnable(enable: boolean): WaitableCommandHandle;

  homeJoint(jointIndex: number): WaitableCommandHandle;
  unhomeJoint(jointIndex: number): WaitableCommandHandle;
  jogStop(
    axisOrJointIndex: number,
    isJointJog: boolean
  ): WaitableCommandHandle;
  jogContinuous(
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number
  ): WaitableCommandHandle;
  jogIncrement(
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number,
    increment: number
  ): WaitableCommandHandle;
  setMinPositionLimit(
    jointIndex: number,
    limit: number
  ): WaitableCommandHandle;
  setMaxPositionLimit(
    jointIndex: number,
    limit: number
  ): WaitableCommandHandle;

  spindleOn(
    speed: number,
    spindleIndex?: number,
    waitForSpeed?: boolean
  ): WaitableCommandHandle;
  spindleIncrease(spindleIndex?: number): WaitableCommandHandle;
  spindleDecrease(spindleIndex?: number): WaitableCommandHandle;
  spindleOff(spindleIndex?: number): WaitableCommandHandle;
  spindleBrake(
    engage: boolean,
    spindleIndex?: number
  ): WaitableCommandHandle;

  setMist(on: boolean): WaitableCommandHandle;
  setFlood(on: boolean): WaitableCommandHandle;

  loadToolTable(): WaitableCommandHandle;
  setTool(
    toolEntry: RecursivePartial<ToolEntry> & { toolNo: number }
  ): WaitableCommandHandle;

  setDigitalOutput(index: number, value: boolean): WaitableCommandHandle;
  setAnalogOutput(index: number, value: number): WaitableCommandHandle;

  setDebugLevel(level: DebugFlags): WaitableCommandHandle;
  sendOperatorError(message: string): WaitableCommandHandle;
  sendOperatorText(message: string): WaitableCommandHandle;
  sendOperatorDisplay(message: string): WaitableCommandHandle;
}

class CommandHandleImpl implements CommandHandle {
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

class WaitableCommandHandleImpl
  extends CommandHandleImpl
  implements WaitableCommandHandle
{
  constructor(
    accepted: Promise<CommandAccepted>,
    private readonly waitForSerial: (
      serial: number,
      timeoutMs?: number
    ) => Promise<RcsStatus>,
    private readonly canWait: () => boolean,
    private readonly trackWait: <T>(promise: Promise<T>) => Promise<T>
  ) {
    super(accepted);
  }

  wait(options: CommandWaitOptions = {}): Promise<RcsStatus> {
    if (!this.canWait()) {
      return Promise.reject(
        new Error("Command wait requires active withLock().")
      );
    }
    return this.trackWait(this.waitForCompletion(options));
  }

  private async waitForCompletion(
    options: CommandWaitOptions
  ): Promise<RcsStatus> {
    const accepted = await this.accepted;
    if (accepted.serial === null) {
      return accepted.status;
    }

    const status = await this.waitForSerial(accepted.serial, options.timeout);
    if (status !== RcsStatus.DONE) {
      throw new Error(
        `Command completion failed with RCS status: ${
          RcsStatus[status] || status
        }`
      );
    }
    return status;
  }
}

/**
 * Recommended command API for LinuxCNC's two-stage command lifecycle.
 *
 * Await a public command handle for LinuxCNC acceptance. Use `withLock()` when
 * command completion is required; handles created inside the lock expose
 * `.wait()` because no command from this instance can interleave.
 */
export class CommandChannelV2 {
  private static readonly lockContext = new AsyncLocalStorage<CommandLockContext>();

  private nativeInstance: NapiCommandChannelInstance;
  private lockTail: Promise<void> = Promise.resolve();
  private readonly lockedCommands: LockedCommandChannel;

  constructor() {
    this.nativeInstance = new addon.NativeCommandChannel({
      waitMode: "accepted",
    });
    this.lockedCommands = this.createLockedCommands();
  }

  async withLock<T>(
    fn: (command: LockedCommandChannel) => T | Promise<T>
  ): Promise<T> {
    return this.runWithCommandLock(() => fn(this.lockedCommands));
  }

  private async runWithCommandLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const currentContext = CommandChannelV2.lockContext.getStore();
    if (currentContext?.channel === this) {
      return this.trackCommandLockOperation(Promise.resolve().then(fn));
    }

    const previous = this.lockTail;
    let release!: () => void;
    this.lockTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    const lockContext: CommandLockContext = {
      channel: this,
      pending: new Set(),
    };

    try {
      return await CommandChannelV2.lockContext.run(lockContext, async () => {
        const result = await fn();
        await this.drainCommandLockOperations(lockContext);
        return result;
      });
    } finally {
      release();
    }
  }

  private hasCommandLock(): boolean {
    return CommandChannelV2.lockContext.getStore()?.channel === this;
  }

  private trackCommandLockOperation<T>(promise: Promise<T>): Promise<T> {
    const context = CommandChannelV2.lockContext.getStore();
    if (context?.channel !== this) {
      return promise;
    }

    const tracked = promise.finally(() => {
      context.pending.delete(tracked);
    });
    context.pending.add(tracked);
    void tracked.catch(() => undefined);
    return promise;
  }

  private async drainCommandLockOperations(
    context: CommandLockContext
  ): Promise<void> {
    while (context.pending.size > 0) {
      await Promise.all([...context.pending]);
    }
  }

  private execAccepted(
    nativeMethod: keyof NapiCommandChannelInstance,
    ...args: unknown[]
  ): CommandHandle {
    return new CommandHandleImpl(
      this.runWithCommandLock(() =>
        this.acceptNativeCommand(nativeMethod, args)
      )
    );
  }

  private execLockedAccepted(
    nativeMethod: keyof NapiCommandChannelInstance,
    ...args: unknown[]
  ): WaitableCommandHandle {
    const accepted = this.hasCommandLock()
      ? this.trackCommandLockOperation(
          this.acceptNativeCommand(nativeMethod, args)
        )
      : Promise.reject(
          new Error("Locked command channel can only be used inside withLock().")
        );

    return new WaitableCommandHandleImpl(
      accepted,
      (serial, timeoutMs) =>
        this.nativeInstance.waitCompleteForSerial(serial, timeoutMs),
      () => this.hasCommandLock(),
      (promise) => this.trackCommandLockOperation(promise)
    );
  }

  private execLocalCompletion(execute: () => Promise<RcsStatus>): CommandHandle {
    return new CommandHandleImpl(
      this.runWithCommandLock(() => this.acceptLocalCommand(execute))
    );
  }

  private execLockedLocalCompletion(
    execute: () => Promise<RcsStatus>
  ): WaitableCommandHandle {
    const accepted = this.hasCommandLock()
      ? this.trackCommandLockOperation(this.acceptLocalCommand(execute))
      : Promise.reject(
          new Error("Locked command channel can only be used inside withLock().")
        );

    return new WaitableCommandHandleImpl(
      accepted,
      () => accepted.then((result) => result.status),
      () => this.hasCommandLock(),
      (promise) => this.trackCommandLockOperation(promise)
    );
  }

  private async acceptNativeCommand(
    nativeMethod: keyof NapiCommandChannelInstance,
    args: unknown[]
  ): Promise<CommandAccepted> {
    try {
      const cmdFunc = this.nativeInstance[
        nativeMethod
      ] as unknown as NativeAcceptedMethod;
      const result = await cmdFunc.apply(this.nativeInstance, args);
      return this.toCommandAccepted(result);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.startsWith("Command acceptance failed")
      ) {
        throw error;
      }
      throw new Error(
        `Command native acceptance failed: ${this.errorMessage(error)}`
      );
    }
  }

  private async acceptLocalCommand(
    execute: () => Promise<RcsStatus>
  ): Promise<CommandAccepted> {
    try {
      const status = await execute();
      return this.toLocalCommandAccepted(status);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.startsWith("Command acceptance failed")
      ) {
        throw error;
      }
      throw new Error(
        `Command native acceptance failed: ${this.errorMessage(error)}`
      );
    }
  }

  private toCommandAccepted(
    result: NativeCommandAccepted | RcsStatus
  ): CommandAccepted {
    if (typeof result === "number") {
      return this.toLocalCommandAccepted(result, this.nativeInstance.serial);
    }

    if (result.status !== RcsStatus.DONE) {
      throw new Error(
        `Command acceptance failed with RCS status: ${
          RcsStatus[result.status] || result.status
        }`
      );
    }

    return {
      status: RcsStatus.DONE,
      serial: typeof result.serial === "number" ? result.serial : null,
    };
  }

  private toLocalCommandAccepted(
    status: RcsStatus,
    serial: number | null = null
  ): CommandAccepted {
    if (status !== RcsStatus.DONE) {
      throw new Error(
        `Command acceptance failed with RCS status: ${
          RcsStatus[status] || status
        }`
      );
    }

    return {
      status: RcsStatus.DONE,
      serial,
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private createLockedCommands(): LockedCommandChannel {
    return {
      setTaskMode: (mode) => this.execLockedAccepted("setTaskMode", mode),
      setState: (state) => this.execLockedAccepted("setState", state),
      taskPlanSynch: () => this.execLockedAccepted("taskPlanSynch"),
      resetInterpreter: () => this.execLockedAccepted("resetInterpreter"),
      programOpen: (filePath) =>
        this.execLockedAccepted("programOpen", filePath),
      programClose: () => this.execLockedAccepted("programClose"),
      runProgram: (startLine = 0) =>
        this.execLockedAccepted("runProgram", startLine),
      pauseProgram: () => this.execLockedAccepted("pauseProgram"),
      resumeProgram: () => this.execLockedAccepted("resumeProgram"),
      stepProgram: () => this.execLockedAccepted("stepProgram"),
      reverseProgram: () => this.execLockedAccepted("reverseProgram"),
      forwardProgram: () => this.execLockedAccepted("forwardProgram"),
      stop: () => this.execLockedAccepted("stop"),
      abortTask: () => this.execLockedAccepted("abortTask"),
      setOptionalStop: (enable) =>
        this.execLockedAccepted("setOptionalStop", enable),
      setBlockDelete: (enable) =>
        this.execLockedAccepted("setBlockDelete", enable),
      mdi: (command) => this.execLockedAccepted("mdi", command),

      setTrajMode: (mode) => this.execLockedAccepted("setTrajMode", mode),
      setMaxVelocity: (velocity) =>
        this.execLockedAccepted("setMaxVelocity", velocity),
      setFeedRate: (scale) => this.execLockedAccepted("setFeedRate", scale),
      setRapidRate: (scale) => this.execLockedAccepted("setRapidRate", scale),
      setSpindleOverride: (scale, spindleIndex = 0) =>
        this.execLockedAccepted("setSpindleOverride", scale, spindleIndex),
      overrideLimits: () => this.execLockedAccepted("overrideLimits"),
      teleopEnable: (enable) =>
        this.execLockedAccepted("teleopEnable", enable),
      setFeedOverrideEnable: (enable) =>
        this.execLockedAccepted("setFeedOverrideEnable", enable),
      setSpindleOverrideEnable: (enable, spindleIndex = 0) =>
        this.execLockedAccepted(
          "setSpindleOverrideEnable",
          enable,
          spindleIndex
        ),
      setFeedHoldEnable: (enable) =>
        this.execLockedAccepted("setFeedHoldEnable", enable),
      setAdaptiveFeedEnable: (enable) =>
        this.execLockedAccepted("setAdaptiveFeedEnable", enable),

      homeJoint: (jointIndex) =>
        this.execLockedAccepted("homeJoint", jointIndex),
      unhomeJoint: (jointIndex) =>
        this.execLockedAccepted("unhomeJoint", jointIndex),
      jogStop: (axisOrJointIndex, isJointJog) =>
        this.execLockedAccepted("jogStop", axisOrJointIndex, isJointJog),
      jogContinuous: (axisOrJointIndex, isJointJog, speed) =>
        this.execLockedAccepted(
          "jogContinuous",
          axisOrJointIndex,
          isJointJog,
          speed
        ),
      jogIncrement: (axisOrJointIndex, isJointJog, speed, increment) =>
        this.execLockedAccepted(
          "jogIncrement",
          axisOrJointIndex,
          isJointJog,
          speed,
          increment
        ),
      setMinPositionLimit: (jointIndex, limit) =>
        this.execLockedAccepted("setMinPositionLimit", jointIndex, limit),
      setMaxPositionLimit: (jointIndex, limit) =>
        this.execLockedAccepted("setMaxPositionLimit", jointIndex, limit),

      spindleOn: (speed, spindleIndex = 0, waitForSpeed = true) =>
        this.execLockedAccepted(
          "spindleOn",
          speed,
          spindleIndex,
          waitForSpeed
        ),
      spindleIncrease: (spindleIndex = 0) =>
        this.execLockedAccepted("spindleIncrease", spindleIndex),
      spindleDecrease: (spindleIndex = 0) =>
        this.execLockedAccepted("spindleDecrease", spindleIndex),
      spindleOff: (spindleIndex = 0) =>
        this.execLockedAccepted("spindleOff", spindleIndex),
      spindleBrake: (engage, spindleIndex = 0) =>
        this.execLockedAccepted("spindleBrake", engage, spindleIndex),

      setMist: (on) => this.execLockedAccepted("setMist", on),
      setFlood: (on) => this.execLockedAccepted("setFlood", on),

      loadToolTable: () => this.execLockedAccepted("loadToolTable"),
      setTool: (toolEntry) =>
        this.execLockedLocalCompletion(() =>
          this.nativeInstance.setTool(toolEntry)
        ),

      setDigitalOutput: (index, value) =>
        this.execLockedAccepted("setDigitalOutput", index, value),
      setAnalogOutput: (index, value) =>
        this.execLockedAccepted("setAnalogOutput", index, value),

      setDebugLevel: (level) =>
        this.execLockedAccepted("setDebugLevel", level),
      sendOperatorError: (message) =>
        this.execLockedAccepted("sendOperatorError", message),
      sendOperatorText: (message) =>
        this.execLockedAccepted("sendOperatorText", message),
      sendOperatorDisplay: (message) =>
        this.execLockedAccepted("sendOperatorDisplay", message),
    };
  }

  // --- Task Commands ---
  setTaskMode(mode: TaskMode): CommandHandle {
    return this.execAccepted("setTaskMode", mode);
  }

  setState(state: TaskState): CommandHandle {
    return this.execAccepted("setState", state);
  }

  taskPlanSynch(): CommandHandle {
    return this.execAccepted("taskPlanSynch");
  }

  resetInterpreter(): CommandHandle {
    return this.execAccepted("resetInterpreter");
  }

  programOpen(filePath: string): CommandHandle {
    return this.execAccepted("programOpen", filePath);
  }

  programClose(): CommandHandle {
    return this.execAccepted("programClose");
  }

  runProgram(startLine: number = 0): CommandHandle {
    return this.execAccepted("runProgram", startLine);
  }

  pauseProgram(): CommandHandle {
    return this.execAccepted("pauseProgram");
  }

  resumeProgram(): CommandHandle {
    return this.execAccepted("resumeProgram");
  }

  stepProgram(): CommandHandle {
    return this.execAccepted("stepProgram");
  }

  reverseProgram(): CommandHandle {
    return this.execAccepted("reverseProgram");
  }

  forwardProgram(): CommandHandle {
    return this.execAccepted("forwardProgram");
  }

  stop(): CommandHandle {
    return this.execAccepted("stop");
  }

  abortTask(): CommandHandle {
    return this.execAccepted("abortTask");
  }

  setOptionalStop(enable: boolean): CommandHandle {
    return this.execAccepted("setOptionalStop", enable);
  }

  setBlockDelete(enable: boolean): CommandHandle {
    return this.execAccepted("setBlockDelete", enable);
  }

  mdi(command: string): CommandHandle {
    return this.execAccepted("mdi", command);
  }

  // --- Trajectory Commands ---
  setTrajMode(mode: TrajMode): CommandHandle {
    return this.execAccepted("setTrajMode", mode);
  }

  setMaxVelocity(velocity: number): CommandHandle {
    return this.execAccepted("setMaxVelocity", velocity);
  }

  setFeedRate(scale: number): CommandHandle {
    return this.execAccepted("setFeedRate", scale);
  }

  setRapidRate(scale: number): CommandHandle {
    return this.execAccepted("setRapidRate", scale);
  }

  setSpindleOverride(scale: number, spindleIndex: number = 0): CommandHandle {
    return this.execAccepted("setSpindleOverride", scale, spindleIndex);
  }

  overrideLimits(): CommandHandle {
    return this.execAccepted("overrideLimits");
  }

  teleopEnable(enable: boolean): CommandHandle {
    return this.execAccepted("teleopEnable", enable);
  }

  setFeedOverrideEnable(enable: boolean): CommandHandle {
    return this.execAccepted("setFeedOverrideEnable", enable);
  }

  setSpindleOverrideEnable(
    enable: boolean,
    spindleIndex: number = 0
  ): CommandHandle {
    return this.execAccepted(
      "setSpindleOverrideEnable",
      enable,
      spindleIndex
    );
  }

  setFeedHoldEnable(enable: boolean): CommandHandle {
    return this.execAccepted("setFeedHoldEnable", enable);
  }

  setAdaptiveFeedEnable(enable: boolean): CommandHandle {
    return this.execAccepted("setAdaptiveFeedEnable", enable);
  }

  // --- Joint Commands ---
  homeJoint(jointIndex: number): CommandHandle {
    return this.execAccepted("homeJoint", jointIndex);
  }

  unhomeJoint(jointIndex: number): CommandHandle {
    return this.execAccepted("unhomeJoint", jointIndex);
  }

  jogStop(axisOrJointIndex: number, isJointJog: boolean): CommandHandle {
    return this.execAccepted("jogStop", axisOrJointIndex, isJointJog);
  }

  jogContinuous(
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number
  ): CommandHandle {
    return this.execAccepted(
      "jogContinuous",
      axisOrJointIndex,
      isJointJog,
      speed
    );
  }

  jogIncrement(
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number,
    increment: number
  ): CommandHandle {
    return this.execAccepted(
      "jogIncrement",
      axisOrJointIndex,
      isJointJog,
      speed,
      increment
    );
  }

  setMinPositionLimit(jointIndex: number, limit: number): CommandHandle {
    return this.execAccepted("setMinPositionLimit", jointIndex, limit);
  }

  setMaxPositionLimit(jointIndex: number, limit: number): CommandHandle {
    return this.execAccepted("setMaxPositionLimit", jointIndex, limit);
  }

  // --- Spindle Commands ---
  spindleOn(
    speed: number,
    spindleIndex: number = 0,
    waitForSpeed: boolean = true
  ): CommandHandle {
    return this.execAccepted(
      "spindleOn",
      speed,
      spindleIndex,
      waitForSpeed
    );
  }

  spindleIncrease(spindleIndex: number = 0): CommandHandle {
    return this.execAccepted("spindleIncrease", spindleIndex);
  }

  spindleDecrease(spindleIndex: number = 0): CommandHandle {
    return this.execAccepted("spindleDecrease", spindleIndex);
  }

  spindleOff(spindleIndex: number = 0): CommandHandle {
    return this.execAccepted("spindleOff", spindleIndex);
  }

  spindleBrake(engage: boolean, spindleIndex: number = 0): CommandHandle {
    return this.execAccepted("spindleBrake", engage, spindleIndex);
  }

  // --- Coolant Commands ---
  setMist(on: boolean): CommandHandle {
    return this.execAccepted("setMist", on);
  }

  setFlood(on: boolean): CommandHandle {
    return this.execAccepted("setFlood", on);
  }

  // --- Tool Commands ---
  loadToolTable(): CommandHandle {
    return this.execAccepted("loadToolTable");
  }

  setTool(
    toolEntry: RecursivePartial<ToolEntry> & { toolNo: number }
  ): CommandHandle {
    return this.execLocalCompletion(() =>
      this.nativeInstance.setTool(toolEntry)
    );
  }

  // --- IO Commands ---
  setDigitalOutput(index: number, value: boolean): CommandHandle {
    return this.execAccepted("setDigitalOutput", index, value);
  }

  setAnalogOutput(index: number, value: number): CommandHandle {
    return this.execAccepted("setAnalogOutput", index, value);
  }

  // --- Debug & Message Commands ---
  setDebugLevel(level: DebugFlags): CommandHandle {
    return this.execAccepted("setDebugLevel", level);
  }

  sendOperatorError(message: string): CommandHandle {
    return this.execAccepted("sendOperatorError", message);
  }

  sendOperatorText(message: string): CommandHandle {
    return this.execAccepted("sendOperatorText", message);
  }

  sendOperatorDisplay(message: string): CommandHandle {
    return this.execAccepted("sendOperatorDisplay", message);
  }

  getSerial(): number {
    if (!this.nativeInstance)
      throw new Error("CommandChannel native instance not available.");
    return this.nativeInstance.serial;
  }

  destroy(): void {
    this.disconnect();
  }

  disconnect(): void {
    if (this.nativeInstance) {
      this.nativeInstance.disconnect();
    }
  }
}
