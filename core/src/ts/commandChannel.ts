import { NapiCommandChannelInstance } from "./native_type_interfaces";
import { TaskMode, TaskState, TrajMode, RcsStatus, addon } from "./constants";
import { DebugFlags, RecursivePartial, ToolEntry } from "./types";

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
  /**
   * Sets the task execution mode for LinuxCNC
   *
   * @param mode - The task mode to set (MDI, MANUAL, or AUTO)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Switch to MDI mode for manual data input
   * await commandChannel.setTaskMode(TaskMode.MDI);
   *
   * // Switch to manual mode for jogging
   * await commandChannel.setTaskMode(TaskMode.MANUAL);
   *
   * // Switch to auto mode for program execution
   * await commandChannel.setTaskMode(TaskMode.AUTO);
   * ```
   */
  async setTaskMode(mode: TaskMode): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setTaskMode, mode);
  }

  /**
   * Sets the task state for LinuxCNC
   *
   * @param state - The task state to set (ESTOP, ESTOP_RESET, OFF, or ON)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Enable E-stop
   * await commandChannel.setState(TaskState.ESTOP);
   *
   * // Reset E-stop
   * await commandChannel.setState(TaskState.ESTOP_RESET);
   *
   * // Turn machine on
   * await commandChannel.setState(TaskState.ON);
   * ```
   */
  async setState(state: TaskState): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setState, state);
  }

  /**
   * On completion of this call, the VAR file on disk is updated with live values from the interpreter.
   *
   * @returns Promise resolving to RcsStatus indicating command completion
   */
  async taskPlanSynch(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.taskPlanSynch);
  }

  /**
   * Resets the G-code interpreter
   *
   * @returns Promise resolving to RcsStatus indicating command completion
   */
  async resetInterpreter(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.resetInterpreter);
  }

  /**
   * Opens a G-code program file for execution
   *
   * @param filePath - Absolute path to the G-code file to open
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Open a G-code program
   * await commandChannel.programOpen('/home/user/programs/part.ngc');
   * ```
   */
  async programOpen(filePath: string): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.programOpen, filePath);
  }

  /**
   * Runs the currently loaded G-code program
   *
   * @param startLine - Line number to start execution from (default: 0 for beginning)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Run program from the beginning
   * await commandChannel.runProgram();
   *
   * // Run program starting from line 100
   * await commandChannel.runProgram(100);
   * ```
   */
  async runProgram(startLine: number = 0): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.runProgram, startLine);
  }

  /**
   * Pauses the currently running G-code program
   * Program can be resumed with resumeProgram()
   *
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Pause the running program
   * await commandChannel.pauseProgram();
   * ```
   */
  async pauseProgram(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.pauseProgram);
  }

  /**
   * Resumes a paused G-code program
   *
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Resume the paused program
   * await commandChannel.resumeProgram();
   * ```
   */
  async resumeProgram(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.resumeProgram);
  }

  /**
   * Executes a single step of the G-code program
   * Advances program execution by one line/block
   *
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Step through program one line at a time
   * await commandChannel.stepProgram();
   * ```
   */
  async stepProgram(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.stepProgram);
  }

  /**
   * Reverses program execution direction
   * Used for backing up through a program
   *
   * @returns Promise resolving to RcsStatus indicating command completion
   */
  async reverseProgram(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.reverseProgram);
  }

  /**
   * Sets program execution direction to forward
   * Used after reversing to resume normal forward execution
   *
   * @returns Promise resolving to RcsStatus indicating command completion
   */
  async forwardProgram(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.forwardProgram);
  }

  /**
   * Aborts the currently running task/program
   * Immediately stops all motion and task execution
   *
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Emergency stop of current program
   * await commandChannel.abortTask();
   * ```
   */
  async abortTask(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.abortTask);
  }

  /**
   * Enables or disables optional stop (M1) functionality
   * When enabled, M1 codes in programs will pause execution
   *
   * @param enable - true to enable optional stops, false to disable
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Enable optional stops
   * await commandChannel.setOptionalStop(true);
   *
   * // Disable optional stops
   * await commandChannel.setOptionalStop(false);
   * ```
   */
  async setOptionalStop(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setOptionalStop, enable);
  }

  /**
   * Enables or disables block delete functionality
   * When enabled, lines beginning with "/" are skipped during execution
   *
   * @param enable - true to enable block delete, false to disable
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Enable block delete - skip lines starting with "/"
   * await commandChannel.setBlockDelete(true);
   *
   * // Disable block delete - execute all lines
   * await commandChannel.setBlockDelete(false);
   * ```
   */
  async setBlockDelete(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setBlockDelete, enable);
  }

  /**
   * Executes a Manual Data Input (MDI) command
   * Allows direct execution of G-code commands without a program file
   *
   * @param command - G-code command string to execute
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Move to position
   * await commandChannel.mdi('G0 X10 Y20 Z5');
   *
   * // Set spindle speed
   * await commandChannel.mdi('S1000 M3');
   * ```
   */
  async mdi(command: string): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.mdi, command);
  }

  // --- Trajectory Commands ---
  /**
   * Sets the trajectory mode for coordinated motion
   *
   * @param mode - The trajectory mode (FREE, COORD, or TELEOP)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Set to coordinated mode for normal G-code execution
   * await commandChannel.setTrajMode(TrajMode.COORD);
   *
   * // Set to free mode for individual joint control
   * await commandChannel.setTrajMode(TrajMode.FREE);
   * ```
   */
  async setTrajMode(mode: TrajMode): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setTrajMode, mode);
  }

  /**
   * Sets the maximum velocity for trajectory planning
   *
   * @param velocity - Maximum velocity in machine units per second
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Set maximum velocity to 200 units/second
   * await commandChannel.setMaxVelocity(200);
   * ```
   */
  async setMaxVelocity(velocity: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setMaxVelocity, velocity);
  }

  /**
   * Sets the feedrate override scale factor
   *
   * @param scale - Feedrate scale factor (1.0 = 100%, 0.5 = 50%, 2.0 = 200%)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Set feedrate to 50% of programmed values
   * await commandChannel.setFeedRate(0.5);
   *
   * // Set feedrate to 120% of programmed values
   * await commandChannel.setFeedRate(1.2);
   * ```
   */
  async setFeedRate(scale: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setFeedRate, scale);
  }

  /**
   * Sets the rapid traverse override scale factor
   *
   * @param scale - Rapid rate scale factor (1.0 = 100%, 0.25 = 25%)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Set rapid rate to 50%
   * await commandChannel.setRapidRate(0.5);
   * ```
   */
  async setRapidRate(scale: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setRapidRate, scale);
  }

  /**
   * Sets the spindle speed override scale factor
   *
   * @param scale - Spindle override scale factor (1.0 = 100%)
   * @param spindleIndex - Index of the spindle to control (default: 0)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Set spindle speed to 80% of programmed values
   * await commandChannel.setSpindleOverride(0.8);
   *
   * // Set spindle 1 speed to 110%
   * await commandChannel.setSpindleOverride(1.1, 1);
   * ```
   */
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

  /**
   * Overrides axis limits to allow motion beyond normal soft limits
   *
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Override limits for recovery from limit switch activation
   * await commandChannel.overrideLimits();
   * ```
   */
  async overrideLimits(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.overrideLimits);
  }

  /**
   * Enables or disables teleop mode
   *
   * @param enable - true to enable teleop mode, false for joint mode
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Enable teleop mode for Cartesian jogging
   * await commandChannel.teleopEnable(true);
   *
   * // Disable teleop mode for joint jogging
   * await commandChannel.teleopEnable(false);
   * ```
   */
  async teleopEnable(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.teleopEnable, enable);
  }

  /**
   * Enables or disables feedrate override functionality
   *
   * @param enable - true to enable feedrate override, false to disable
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Enable feedrate override control
   * await commandChannel.setFeedOverrideEnable(true);
   * ```
   */
  async setFeedOverrideEnable(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setFeedOverrideEnable, enable);
  }

  /**
   * Enables or disables spindle speed override functionality
   *
   * @param enable - true to enable spindle override, false to disable
   * @param spindleIndex - Index of the spindle to control (default: 0)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Enable spindle override control
   * await commandChannel.setSpindleOverrideEnable(true);
   * ```
   */
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

  /**
   * Enables or disables feed hold functionality
   * When enabled, allows pausing motion without stopping the program
   *
   * @param enable - true to enable feed hold, false to disable
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Enable feed hold capability
   * await commandChannel.setFeedHoldEnable(true);
   * ```
   */
  async setFeedHoldEnable(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setFeedHoldEnable, enable);
  }

  /**
   * Enables or disables adaptive feed functionality
   * Allows external signals to modulate feedrate in real-time
   *
   * @param enable - true to enable adaptive feed, false to disable
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Enable adaptive feed for force-sensitive machining
   * await commandChannel.setAdaptiveFeedEnable(true);
   * ```
   */
  async setAdaptiveFeedEnable(enable: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setAdaptiveFeedEnable, enable);
  }

  // --- Joint Commands ---
  /**
   * Homes a specific joint by moving it to its home position
   *
   * @param jointIndex - Zero-based index of the joint to home, -1 to home all joints
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Home joint 0 (typically X-axis)
   * await commandChannel.homeJoint(0);
   *
   * // Home joint 2 (typically Z-axis)
   * await commandChannel.homeJoint(2);
   *
   * // Home all joints
   * await commandChannel.homeJoint(-1);
   * ```
   */
  async homeJoint(jointIndex: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.homeJoint, jointIndex);
  }

  /**
   * Unhomes a specific joint, clearing its homed status
   *
   * @param jointIndex - Zero-based index of the joint to unhome, -1 to unhome all joints
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Unhome joint 1 (typically Y-axis)
   * await commandChannel.unhomeJoint(1);
   *
   * // Unhome all joints
   * await commandChannel.unhomeJoint(-1);
   * ```
   */
  async unhomeJoint(jointIndex: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.unhomeJoint, jointIndex);
  }

  /**
   * Stops jogging motion for a specific axis or joint
   *
   * @param axisOrJointIndex - Index of the axis (0=X,1=Y,2=Z...) or joint to stop
   * @param isJointJog - true for joint jogging, false for axis jogging
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Stop axis X jogging
   * await commandChannel.jogStop(0, false);
   *
   * // Stop joint 1 jogging
   * await commandChannel.jogStop(1, true);
   * ```
   */
  async jogStop(
    axisOrJointIndex: number,
    isJointJog: boolean
  ): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.jogStop, axisOrJointIndex, isJointJog);
  }

  /**
   * Starts continuous jogging motion for a specific axis or joint
   *
   * @param axisOrJointIndex - Index of the axis (0=X,1=Y,2=Z...) or joint to jog
   * @param isJointJog - true for joint jogging, false for axis jogging
   * @param speed - Jogging speed in machine units per second
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Jog X axis continuously at 10 units/sec
   * await commandChannel.jogContinuous(0, false, 10);
   *
   * // Jog joint 2 continuously at -5 units/sec (negative direction)
   * await commandChannel.jogContinuous(2, true, -5);
   * ```
   */
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

  /**
   * Jogs a specific distance at a given speed for an axis or joint
   *
   * @param axisOrJointIndex - Index of the axis (0=X,1=Y,2=Z...) or joint to jog
   * @param isJointJog - true for joint jogging, false for axis jogging
   * @param speed - Jogging speed in machine units per second
   * @param increment - Distance to jog in machine units
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Jog Y axis 1.0 unit at 5 units/sec
   * await commandChannel.jogIncrement(1, false, 5, 1.0);
   *
   * // Jog joint 0 back 0.1 units at 2 units/sec
   * await commandChannel.jogIncrement(0, true, 2, -0.1);
   * ```
   */
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

  /**
   * Sets the minimum position limit for a joint
   *
   * @param jointIndex - Zero-based index of the joint
   * @param limit - Minimum position limit in machine units
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Set minimum limit for joint 0 to -100 units
   * await commandChannel.setMinPositionLimit(0, -100);
   * ```
   */
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

  /**
   * Sets the maximum position limit for a joint
   *
   * @param jointIndex - Zero-based index of the joint
   * @param limit - Maximum position limit in machine units
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Set maximum limit for joint 0 to 200 units
   * await commandChannel.setMaxPositionLimit(0, 200);
   * ```
   */
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
  /**
   * Turns on the spindle at a specified speed
   *
   * @param speed - Spindle speed in RPM (positive = clockwise, negative = counterclockwise)
   * @param spindleIndex - Index of the spindle to control (default: 0)
   * @param waitForSpeed - Whether to wait for spindle to reach speed before continuing (default: true)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Turn on spindle at 1000 RPM clockwise
   * await commandChannel.spindleOn(1000);
   *
   * // Turn on spindle 1 at 500 RPM counterclockwise
   * await commandChannel.spindleOn(-500, 1);
   *
   * // Start spindle without waiting for speed
   * await commandChannel.spindleOn(800, 0, false);
   * ```
   */
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

  /**
   * Increases spindle speed by a predefined increment
   * Spindle must already be running
   *
   * @param spindleIndex - Index of the spindle to control (default: 0)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Increase speed of main spindle
   * await commandChannel.spindleIncrease();
   *
   * // Increase speed of spindle 1
   * await commandChannel.spindleIncrease(1);
   * ```
   */
  async spindleIncrease(spindleIndex: number = 0): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.spindleIncrease, spindleIndex);
  }

  /**
   * Decreases spindle speed by a predefined increment
   * Spindle must already be running
   *
   * @param spindleIndex - Index of the spindle to control (default: 0)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Decrease speed of main spindle
   * await commandChannel.spindleDecrease();
   *
   * // Decrease speed of spindle 1
   * await commandChannel.spindleDecrease(1);
   * ```
   */
  async spindleDecrease(spindleIndex: number = 0): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.spindleDecrease, spindleIndex);
  }

  /**
   * Turns off the spindle
   *
   * @param spindleIndex - Index of the spindle to control (default: 0)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Turn off main spindle
   * await commandChannel.spindleOff();
   *
   * // Turn off spindle 1
   * await commandChannel.spindleOff(1);
   * ```
   */
  async spindleOff(spindleIndex: number = 0): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.spindleOff, spindleIndex);
  }

  /**
   * Engages or releases the spindle brake
   *
   * @param engage - true to engage brake, false to release brake
   * @param spindleIndex - Index of the spindle to control (default: 0)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Engage spindle brake
   * await commandChannel.spindleBrake(true);
   *
   * // Release brake on spindle 1
   * await commandChannel.spindleBrake(false, 1);
   * ```
   */
  async spindleBrake(
    engage: boolean,
    spindleIndex: number = 0
  ): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.spindleBrake, engage, spindleIndex);
  }

  // --- Coolant Commands ---
  /**
   * Turns mist coolant on or off
   *
   * @param on - true to turn mist on, false to turn off
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Turn on mist coolant
   * await commandChannel.setMist(true);
   *
   * // Turn off mist coolant
   * await commandChannel.setMist(false);
   * ```
   */
  async setMist(on: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setMist, on);
  }

  /**
   * Turns flood coolant on or off
   *
   * @param on - true to turn flood on, false to turn off
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Turn on flood coolant
   * await commandChannel.setFlood(true);
   *
   * // Turn off flood coolant
   * await commandChannel.setFlood(false);
   * ```
   */
  async setFlood(on: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setFlood, on);
  }

  // --- Tool Commands ---
  /**
   * Reloads the tool table from disk
   * Updates the in-memory tool table with changes made to the tool table file
   *
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Reload tool table after editing the .tbl file
   * await commandChannel.loadToolTable();
   * ```
   */
  async loadToolTable(): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.loadToolTable);
  }

  /**
   * Sets tool data for a specific tool number
   * Updates tool geometry and parameters in the tool table
   *
   * @param toolEntry - Tool entry containing tool number and optional geometry data
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Set basic tool data
   * await commandChannel.setTool({
   *   toolNo: 3,
   *   pocketNo: 3
   * });
   *
   * // Set tool with geometry data
   * await commandChannel.setTool({
   *   toolNo: 1,
   *   pocketNo: 1,
   *   diameter: 6.35,
   *   offset: {
   *     x: 0,
   *     y: 0,
   *     z: 25.4
   *   }
   * });
   * ```
   */
  async setTool(
    toolEntry: RecursivePartial<ToolEntry> & { toolNo: number }
  ): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setTool, toolEntry);
  }

  // --- IO Commands ---
  /**
   * Sets the state of a digital output pin
   *
   * @param index - Index of the digital output pin
   * @param value - true to set high, false to set low
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Set digital output 0 high
   * await commandChannel.setDigitalOutput(0, true);
   *
   * // Set digital output 3 low
   * await commandChannel.setDigitalOutput(3, false);
   * ```
   */
  async setDigitalOutput(index: number, value: boolean): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setDigitalOutput, index, value);
  }

  /**
   * Sets the value of an analog output pin
   *
   * @param index - Index of the analog output pin
   * @param value - Analog value to set
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Set analog output 0 to 13.3
   * await commandChannel.setAnalogOutput(0, 13.3);
   * ```
   */
  async setAnalogOutput(index: number, value: number): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setAnalogOutput, index, value);
  }

  // --- Debug & Message Commands ---
  /**
   * Sets debug flags for LinuxCNC components using OR-ed EmcDebug flags
   * Multiple debug categories can be enabled simultaneously by combining flags
   *
   * @param level - Debug flags from EmcDebug enum, can be OR-ed together
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Disable all debugging
   * await commandChannel.setDebugLevel(0);
   *
   * // Enable interpreter debugging only
   * await commandChannel.setDebugLevel(EmcDebug.INTERP);
   *
   * // Enable multiple debug categories
   * await commandChannel.setDebugLevel(EmcDebug.INTERP | EmcDebug.MOTION_TIME);
   *
   * // Enable task and NML debugging
   * await commandChannel.setDebugLevel(EmcDebug.TASK_ISSUE | EmcDebug.NML);
   *
   * // Enable Python and remap debugging for custom components
   * await commandChannel.setDebugLevel(EmcDebug.PYTHON | EmcDebug.REMAP);
   * ```
   */
  async setDebugLevel(level: DebugFlags): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.setDebugLevel, level);
  }

  /**
   * Sends an error message to the operator display
   *
   * @param message - Error message to display (max 254 characters)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Send error message
   * await commandChannel.sendOperatorError('Tool change required');
   * ```
   */
  async sendOperatorError(message: string): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.sendOperatorError, message);
  }

  /**
   * Sends a text message to the operator display
   *
   * @param message - Text message to display (max 254 characters)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Send informational message
   * await commandChannel.sendOperatorText('Setup complete');
   * ```
   */
  async sendOperatorText(message: string): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.sendOperatorText, message);
  }

  /**
   * Sends a display message to the operator
   *
   * @param message - Display message (max 254 characters)
   * @returns Promise resolving to RcsStatus indicating command completion
   *
   * @example
   * ```typescript
   * // Send display message
   * await commandChannel.sendOperatorDisplay('Insert tool T1 M6');
   * ```
   */
  async sendOperatorDisplay(message: string): Promise<RcsStatus> {
    return this.exec(this.nativeInstance.sendOperatorDisplay, message);
  }

  // --- Misc ---
  /**
   * Synchronously waits for the last command to complete
   * This does the same as await but provides a synchronous way to wait for command completion
   *
   * @param timeout - Maximum time to wait in seconds (default: 5 seconds)
   * @returns RcsStatus indicating completion status (RCS_DONE, RCS_ERROR, or -1 for timeout)
   *
   * @example
   * ```typescript
   * // These two approaches are equivalent:
   *
   * // Approach 1: Using await (asynchronous)
   * await commandChannel.runProgram();
   * console.log('Program completed');
   *
   * // Approach 2: Using waitComplete (synchronous)
   * commandChannel.runProgram(); // Fire and forget - don't await
   * const status = commandChannel.waitComplete(); // Synchronously wait for completion
   * if (status === RcsStatus.DONE) {
   *   console.log('Program completed');
   * }
   * ```
   */
  waitComplete(timeout?: number): RcsStatus {
    if (!this.nativeInstance)
      throw new Error("CommandChannel native instance not available.");
    return this.nativeInstance.waitComplete(timeout);
  }

  /**
   * Gets the serial number of the current command
   * Each command sent has a unique serial number for tracking
   *
   * @returns The current command serial number
   *
   * @example
   * ```typescript
   * // Get current command serial number
   * const serial = commandChannel.getSerial();
   * console.log(`Current command serial: ${serial}`);
   * ```
   */
  getSerial(): number {
    if (!this.nativeInstance)
      throw new Error("CommandChannel native instance not available.");
    return this.nativeInstance.serial;
  }

  /**
   * Destroys the command channel and cleans up resources
   * Call this when done using the command channel
   */
  destroy(): void {
    // If nativeInstance had a disconnect or cleanup, call it here
  }
}
