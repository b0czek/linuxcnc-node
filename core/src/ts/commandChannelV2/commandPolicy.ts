import { TaskState } from "@linuxcnc-node/types";
import type { NapiCommandChannelInstance } from "../native_type_interfaces";
import type {
  CommandHandle,
  ExclusiveCommandHandle,
  ExclusiveCommandOptions,
} from "./types";

export type CommandPolicy =
  | "exclusive"
  | "exclusive-local"
  | "immediate"
  | "preemptive"
  | "state";

type NativeMethodName = {
  [K in keyof NapiCommandChannelInstance]:
    NapiCommandChannelInstance[K] extends (...args: any[]) => unknown
      ? K
      : never;
}[keyof NapiCommandChannelInstance];

type NativeCommandName = Exclude<
  NativeMethodName,
  "disconnect" | "waitComplete" | "getStatusSnapshot"
>;

/**
 * Runtime dispatch policy and the source used to derive both public facades.
 * `state` is value-dependent: OFF/ESTOP are preemptive; ON/ESTOP_RESET are
 * exclusive.
 */
export const commandPolicyCatalog = {
  setTaskMode: "exclusive",
  setState: "state",
  taskPlanSynch: "exclusive",
  resetInterpreter: "exclusive",
  programOpen: "exclusive",
  programClose: "exclusive",
  runProgram: "exclusive",
  pauseProgram: "preemptive",
  resumeProgram: "exclusive",
  stepProgram: "exclusive",
  reverseProgram: "exclusive",
  forwardProgram: "exclusive",
  stop: "preemptive",
  abortTask: "preemptive",
  setOptionalStop: "immediate",
  setBlockDelete: "immediate",
  mdi: "exclusive",

  setTrajMode: "exclusive",
  setMaxVelocity: "immediate",
  setFeedRate: "immediate",
  setRapidRate: "immediate",
  setSpindleOverride: "immediate",
  overrideLimits: "immediate",
  teleopEnable: "immediate",
  setFeedOverrideEnable: "immediate",
  setSpindleOverrideEnable: "immediate",
  setFeedHoldEnable: "immediate",
  setAdaptiveFeedEnable: "immediate",

  homeJoint: "exclusive",
  unhomeJoint: "exclusive",
  jogStop: "preemptive",
  jogContinuous: "immediate",
  jogIncrement: "exclusive",
  setMinPositionLimit: "immediate",
  setMaxPositionLimit: "immediate",

  spindleOn: "immediate",
  spindleIncrease: "immediate",
  spindleDecrease: "immediate",
  spindleOff: "immediate",
  spindleBrake: "immediate",

  setMist: "immediate",
  setFlood: "immediate",

  loadToolTable: "exclusive",
  setTool: "exclusive-local",

  setDigitalOutput: "immediate",
  setAnalogOutput: "immediate",

  setDebugLevel: "immediate",
  sendOperatorError: "immediate",
  sendOperatorText: "immediate",
  sendOperatorDisplay: "immediate",
} as const satisfies Record<NativeCommandName, CommandPolicy>;

export type CommandName = keyof typeof commandPolicyCatalog;

type CatalogPolicy<K extends CommandName> =
  (typeof commandPolicyCatalog)[K];

export type ExclusiveCommandName = {
  [K in CommandName]: CatalogPolicy<K> extends
    | "exclusive"
    | "exclusive-local"
    | "state"
    ? K
    : never;
}[CommandName];

export type ImmediateCommandName = {
  [K in CommandName]: CatalogPolicy<K> extends "immediate" ? K : never;
}[CommandName];

export const immediateLockResourceCatalog = {
  feedControls: [
    "setFeedRate",
    "setFeedOverrideEnable",
    "setFeedHoldEnable",
    "setAdaptiveFeedEnable",
  ],
  rapidOverride: ["setRapidRate"],
  spindleOverride: ["setSpindleOverride", "setSpindleOverrideEnable"],
  velocity: ["setMaxVelocity"],
  limitOverrides: ["overrideLimits"],
  positionLimits: ["setMinPositionLimit", "setMaxPositionLimit"],
  teleop: ["teleopEnable"],
  jog: ["jogContinuous"],
  spindle: [
    "spindleOn",
    "spindleIncrease",
    "spindleDecrease",
    "spindleOff",
    "spindleBrake",
  ],
  coolant: ["setMist", "setFlood"],
  outputs: ["setDigitalOutput", "setAnalogOutput"],
  debug: ["setDebugLevel"],
  operatorMessages: [
    "sendOperatorError",
    "sendOperatorText",
    "sendOperatorDisplay",
  ],
  optionalStop: ["setOptionalStop"],
  blockDelete: ["setBlockDelete"],
} as const satisfies Record<string, readonly ImmediateCommandName[]>;

export type ImmediateLockResource =
  keyof typeof immediateLockResourceCatalog;

const immediateCommandLockResourceMap = new Map<
  ImmediateCommandName,
  ImmediateLockResource
>(
  Object.entries(immediateLockResourceCatalog).flatMap(
    ([resource, names]) =>
      names.map((name) => [
        name,
        resource as ImmediateLockResource,
      ])
  )
);

export type TopLevelCommandName = {
  [K in CommandName]: CatalogPolicy<K> extends
    | "immediate"
    | "preemptive"
    | "state"
    ? K
    : never;
}[CommandName];

type NativeCommandArgs<K extends CommandName> =
  NapiCommandChannelInstance[K] extends (...args: infer Args) => unknown
    ? Args
    : never;

type ExclusiveArgs<K extends ExclusiveCommandName> = K extends "setState"
  ? [state: TaskState.ON | TaskState.ESTOP_RESET]
  : K extends "runProgram"
    ? [startLine?: number]
    : NativeCommandArgs<K>;

type TopLevelArgs<K extends TopLevelCommandName> = K extends "setState"
  ? [state: TaskState.OFF | TaskState.ESTOP]
  : NativeCommandArgs<K>;

type ImmediateArgs<K extends ImmediateCommandName> = NativeCommandArgs<K>;

type WithOptions<Args extends unknown[]> = [
  ...Args,
  options?: ExclusiveCommandOptions,
];

interface RunProgramExclusiveMethod {
  (options?: ExclusiveCommandOptions): ExclusiveCommandHandle;
  (
    startLine: number,
    options?: ExclusiveCommandOptions
  ): ExclusiveCommandHandle;
}

export type ExclusiveCommandChannel = {
  [K in ExclusiveCommandName]: K extends "runProgram"
    ? RunProgramExclusiveMethod
    : (
        ...args: WithOptions<ExclusiveArgs<K>>
      ) => ExclusiveCommandHandle;
} & {
  [K in ImmediateCommandName]: (...args: ImmediateArgs<K>) => CommandHandle;
};

export type TopLevelCommandChannel = {
  [K in TopLevelCommandName]: (...args: TopLevelArgs<K>) => CommandHandle;
};

export function policyForInvocation(
  name: CommandName,
  args: readonly unknown[]
): Exclude<CommandPolicy, "state" | "exclusive-local"> | "exclusive-local" {
  const policy = commandPolicyCatalog[name];
  if (policy !== "state") {
    return policy;
  }

  const state = args[0] as TaskState;
  if (state === TaskState.OFF || state === TaskState.ESTOP) {
    return "preemptive";
  }
  if (state === TaskState.ON || state === TaskState.ESTOP_RESET) {
    return "exclusive";
  }
  throw new RangeError(`Unsupported task state: ${String(state)}`);
}

export function exclusiveCommandNames(): ExclusiveCommandName[] {
  return (Object.keys(commandPolicyCatalog) as CommandName[]).filter((name) => {
    const policy = commandPolicyCatalog[name];
    return (
      policy === "exclusive" ||
      policy === "exclusive-local" ||
      policy === "state"
    );
  }) as ExclusiveCommandName[];
}

export function immediateCommandNames(): ImmediateCommandName[] {
  return (Object.keys(commandPolicyCatalog) as CommandName[]).filter((name) => {
    const policy = commandPolicyCatalog[name];
    return policy === "immediate";
  }) as ImmediateCommandName[];
}

export function topLevelCommandNames(): TopLevelCommandName[] {
  return (Object.keys(commandPolicyCatalog) as CommandName[]).filter((name) => {
    const policy = commandPolicyCatalog[name];
    return policy === "immediate" || policy === "preemptive" || policy === "state";
  }) as TopLevelCommandName[];
}

export function immediateLockResourceForCommand(
  name: CommandName
): ImmediateLockResource | undefined {
  return immediateCommandLockResourceMap.get(name as ImmediateCommandName);
}

export function validateImmediateLockResources(
  locks: readonly unknown[] | undefined
): ImmediateLockResource[] {
  if (locks === undefined) return [];
  if (!Array.isArray(locks)) {
    throw new RangeError("Exclusive locks must be an array.");
  }

  const validResources = new Set(Object.keys(immediateLockResourceCatalog));
  const validated = new Set<ImmediateLockResource>();
  for (const lock of locks) {
    if (typeof lock !== "string" || !validResources.has(lock)) {
      throw new RangeError(
        `Invalid immediate lock resource: ${String(lock)}.`
      );
    }
    validated.add(lock as ImmediateLockResource);
  }
  return [...validated];
}

export function takeExclusiveOptions(
  args: unknown[]
): ExclusiveCommandOptions | undefined {
  const last = args[args.length - 1];
  if (
    typeof last === "object" &&
    last !== null &&
    !Array.isArray(last) &&
    ("timeout" in last || Object.keys(last).length === 0)
  ) {
    return args.pop() as ExclusiveCommandOptions;
  }
  return undefined;
}

export function applyCommandDefaults(name: CommandName, args: unknown[]): void {
  switch (name) {
    case "runProgram":
      if (args.length === 0) args.push(0);
      break;
    case "setSpindleOverride":
    case "setSpindleOverrideEnable":
      if (args.length === 1) args.push(0);
      break;
    case "spindleIncrease":
    case "spindleDecrease":
    case "spindleOff":
      if (args.length === 0) args.push(0);
      break;
    case "spindleBrake":
      if (args.length === 1) args.push(0);
      break;
    case "spindleOn":
      if (args.length === 1) args.push(0);
      if (args.length === 2) args.push(true);
      break;
  }
}
