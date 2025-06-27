import { NapiCommandChannelInstance } from "./native_type_interfaces";
import { TaskMode, TaskState, TrajMode, RcsStatus, addon } from "./constants";

export class CommandChannel {
  private nativeInstance: NapiCommandChannelInstance;

  constructor() {
    this.nativeInstance = new addon.NativeCommandChannel();
  }

  private async exec<T extends (...args: any[]) => Promise<RcsStatus>>(
    cmdFunc: T,
    ...args: Parameters<T>
  ): Promise<RcsStatus> {
    try {
      const status = await cmdFunc.apply(this.nativeInstance, args);
      if (status !== RcsStatus.DONE && status !== RcsStatus.EXEC) {
        // EXEC can be ok for some commands that take time
        // Consider if specific commands expect EXEC or only DONE
        // For now, any non-DONE/non-EXEC is potentially an issue to warn about or handle
        throw new Error(
          `Command failed with RCS status: ${RcsStatus[status] || status}`
        );
      }
      return status;
    } catch (e: any) {
      // Native NAPI methods reject promises for async errors
      throw new Error(`Command native execution failed: ${e.message || e}`);
    }
  }

  // --- Task Commands ---
  async setTaskMode(mode: TaskMode): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setTaskMode, mode);
  }
  async setState(state: TaskState): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setState, state);
  }
  async taskPlanSynch(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.taskPlanSynch);
  }
  async resetInterpreter(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.resetInterpreter);
  }
  async programOpen(filePath: string): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.programOpen, filePath);
  }
  async runProgram(startLine: number = 0): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.runProgram, startLine);
  }
  async pauseProgram(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.pauseProgram);
  }
  async resumeProgram(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.resumeProgram);
  }
  async stepProgram(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.stepProgram);
  }
  async reverseProgram(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.reverseProgram);
  }
  async forwardProgram(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.forwardProgram);
  }
  async abortTask(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.abortTask);
  }
  async setOptionalStop(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setOptionalStop, enable);
  }
  async setBlockDelete(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setBlockDelete, enable);
  }
  async mdi(command: string): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.mdi, command);
  }

  // --- Trajectory Commands ---
  async setTrajMode(mode: TrajMode): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setTrajMode, mode);
  }
  async setMaxVelocity(velocity: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setMaxVelocity, velocity);
  }
  async setFeedRate(scale: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setFeedRate, scale);
  }
  async setRapidRate(scale: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setRapidRate, scale);
  }
  async setSpindleOverride(
    scale: number,
    spindleIndex: number = 0
  ): Promise<RcsStatus> {
    return this.exec(
      this.nativeInstance.setSpindleOverride,
      scale,
      spindleIndex
    );
  }
  async overrideLimits(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.overrideLimits);
  }
  async teleopEnable(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.teleopEnable, enable);
  }
  async setFeedOverrideEnable(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setFeedOverrideEnable, enable);
  }
  async setSpindleOverrideEnable(
    enable: boolean,
    spindleIndex: number = 0
  ): Promise<RcsStatus> {
    return this.exec(
      this.nativeInstance.setSpindleOverrideEnable,
      enable,
      spindleIndex
    );
  }
  async setFeedHoldEnable(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setFeedHoldEnable, enable);
  }
  async setAdaptiveFeedEnable(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setAdaptiveFeedEnable, enable);
  }

  // --- Joint Commands ---
  async homeJoint(jointIndex: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.homeJoint, jointIndex);
  }
  async unhomeJoint(jointIndex: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.unhomeJoint, jointIndex);
  }
  async jogStop(
    axisOrJointIndex: number,
    isJointJog: boolean
  ): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.jogStop, axisOrJointIndex, isJointJog);
  }
  async jogContinuous(
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number
  ): Promise<RcsStatus> {
    return this.exec(
      this.nativeInstance.jogContinuous,
      axisOrJointIndex,
      isJointJog,
      speed
    );
  }
  async jogIncrement(
    axisOrJointIndex: number,
    isJointJog: boolean,
    speed: number,
    increment: number
  ): Promise<RcsStatus> {
    return this.exec(
      this.nativeInstance.jogIncrement,
      axisOrJointIndex,
      isJointJog,
      speed,
      increment
    );
  }
  async setMinPositionLimit(
    jointIndex: number,
    limit: number
  ): Promise<RcsStatus> {
    return this.exec(
      this.nativeInstance.setMinPositionLimit,
      jointIndex,
      limit
    );
  }
  async setMaxPositionLimit(
    jointIndex: number,
    limit: number
  ): Promise<RcsStatus> {
    return this.exec(
      this.nativeInstance.setMaxPositionLimit,
      jointIndex,
      limit
    );
  }

  // --- Spindle Commands ---
  async spindleOn(
    speed: number,
    spindleIndex: number = 0,
    waitForSpeed: boolean = true
  ): Promise<RcsStatus> {
    return this.exec(
      this.nativeInstance.spindleOn,
      speed,
      spindleIndex,
      waitForSpeed
    );
  }
  async spindleIncrease(spindleIndex: number = 0): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.spindleIncrease, spindleIndex);
  }
  async spindleDecrease(spindleIndex: number = 0): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.spindleDecrease, spindleIndex);
  }
  async spindleConstant(spindleIndex: number = 0): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.spindleConstant, spindleIndex);
  }
  async spindleOff(spindleIndex: number = 0): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.spindleOff, spindleIndex);
  }
  async spindleBrake(
    engage: boolean,
    spindleIndex: number = 0
  ): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.spindleBrake, engage, spindleIndex);
  }

  // --- Coolant Commands ---
  async setMist(on: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setMist, on);
  }
  async setFlood(on: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setFlood, on);
  }

  // --- Tool Commands ---
  async loadToolTable(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.loadToolTable);
  }
  async setToolOffset(
    toolNumber: number,
    zOffset: number,
    xOffset: number,
    diameter: number,
    frontAngle: number,
    backAngle: number,
    orientation: number
  ): Promise<RcsStatus> {
    return this.exec(
      this.nativeInstance.setToolOffset,
      toolNumber,
      zOffset,
      xOffset,
      diameter,
      frontAngle,
      backAngle,
      orientation
    );
  }

  // --- IO Commands ---
  async setDigitalOutput(index: number, value: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setDigitalOutput, index, value);
  }
  async setAnalogOutput(index: number, value: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setAnalogOutput, index, value);
  }

  // --- Debug & Message Commands ---
  async setDebugLevel(level: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setDebugLevel, level);
  }
  async sendOperatorError(message: string): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.sendOperatorError, message);
  }
  async sendOperatorText(message: string): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.sendOperatorText, message);
  }
  async sendOperatorDisplay(message: string): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.sendOperatorDisplay, message);
  }

  // --- Misc ---
  waitComplete(timeout?: number): RcsStatus {
    if (!this.nativeInstance)
      throw new Error("CommandChannel native instance not available.");
    return this.nativeInstance.waitComplete(timeout);
  }

  getSerial(): number {
    if (!this.nativeInstance)
      throw new Error("CommandChannel native instance not available.");
    return this.nativeInstance.serial;
  }

  destroy(): void {
    // If nativeInstance had a disconnect or cleanup, call it here
  }
}
