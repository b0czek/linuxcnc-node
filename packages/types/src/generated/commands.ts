/** Generated from ExecuteCommandRequest.command. Do not edit manually. */

import type { ProgramHandle, ToolUpdate } from "../core";
import type { TaskMode, TaskState, TrajMode } from "../constants";

export type LinuxCncCommand =
  | { type: "setTaskMode"; mode: TaskMode }
  | { type: "setState"; state: TaskState }
  | { type: "taskPlanSynch" }
  | { type: "resetInterpreter" }
  | { type: "programOpen"; entry: ProgramHandle }
  | { type: "programClose" }
  | { type: "runProgram"; startLine: number }
  | { type: "pauseProgram" }
  | { type: "resumeProgram" }
  | { type: "stepProgram" }
  | { type: "reverseProgram" }
  | { type: "forwardProgram" }
  | { type: "stop" }
  | { type: "abortTask" }
  | { type: "setOptionalStop"; enable: boolean }
  | { type: "setBlockDelete"; enable: boolean }
  | { type: "mdi"; command: string }
  | { type: "setTrajMode"; mode: TrajMode }
  | { type: "setMaxVelocity"; velocity: number }
  | { type: "setFeedRate"; scale: number }
  | { type: "setSpindleOverride"; scale: number; spindleIndex: number }
  | { type: "overrideLimits" }
  | { type: "teleopEnable"; enable: boolean }
  | { type: "setFeedOverrideEnable"; enable: boolean }
  | { type: "setSpindleOverrideEnable"; enable: boolean; spindleIndex: number }
  | { type: "setFeedHoldEnable"; enable: boolean }
  | { type: "setAdaptiveFeedEnable"; enable: boolean }
  | { type: "homeJoint"; jointIndex: number }
  | { type: "unhomeJoint"; jointIndex: number }
  | { type: "jogStop"; axisOrJointIndex: number; isJointJog: boolean }
  | { type: "jogContinuous"; axisOrJointIndex: number; isJointJog: boolean; speed: number }
  | { type: "jogIncrement"; axisOrJointIndex: number; isJointJog: boolean; speed: number; increment: number }
  | { type: "setMinPositionLimit"; jointIndex: number; limit: number }
  | { type: "setMaxPositionLimit"; jointIndex: number; limit: number }
  | { type: "spindleOn"; speed: number; spindleIndex: number; waitForSpeed?: boolean }
  | { type: "spindleIncrease"; spindleIndex: number }
  | { type: "spindleDecrease"; spindleIndex: number }
  | { type: "spindleOff"; spindleIndex: number }
  | { type: "spindleBrake"; engage: boolean; spindleIndex: number }
  | { type: "setMist"; on: boolean }
  | { type: "setFlood"; on: boolean }
  | { type: "loadToolTable" }
  | { type: "setTool"; tool: ToolUpdate }
  | { type: "deleteTool"; toolNo: number }
  | { type: "setDigitalOutput"; index: number; value: boolean }
  | { type: "setAnalogOutput"; index: number; value: number }
  | { type: "setDebugLevel"; level: number }
  | { type: "sendOperatorError"; message: string }
  | { type: "sendOperatorText"; message: string }
  | { type: "sendOperatorDisplay"; message: string }
  | { type: "setRapidRate"; scale: number }
;

export type LinuxCncCommandOf<
  T extends LinuxCncCommand["type"],
> = Extract<LinuxCncCommand, { type: T }>;

export const LINUXCNC_COMMAND_TYPES = [
  "setTaskMode",
  "setState",
  "taskPlanSynch",
  "resetInterpreter",
  "programOpen",
  "programClose",
  "runProgram",
  "pauseProgram",
  "resumeProgram",
  "stepProgram",
  "reverseProgram",
  "forwardProgram",
  "stop",
  "abortTask",
  "setOptionalStop",
  "setBlockDelete",
  "mdi",
  "setTrajMode",
  "setMaxVelocity",
  "setFeedRate",
  "setSpindleOverride",
  "overrideLimits",
  "teleopEnable",
  "setFeedOverrideEnable",
  "setSpindleOverrideEnable",
  "setFeedHoldEnable",
  "setAdaptiveFeedEnable",
  "homeJoint",
  "unhomeJoint",
  "jogStop",
  "jogContinuous",
  "jogIncrement",
  "setMinPositionLimit",
  "setMaxPositionLimit",
  "spindleOn",
  "spindleIncrease",
  "spindleDecrease",
  "spindleOff",
  "spindleBrake",
  "setMist",
  "setFlood",
  "loadToolTable",
  "setTool",
  "deleteTool",
  "setDigitalOutput",
  "setAnalogOutput",
  "setDebugLevel",
  "sendOperatorError",
  "sendOperatorText",
  "sendOperatorDisplay",
  "setRapidRate",
] as const satisfies readonly LinuxCncCommand["type"][];

