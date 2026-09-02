import type * as grpc from "@grpc/grpc-js";
import type {
  CommandWaitPolicy,
  LinuxCncCommand,
  Position,
} from "@linuxcnc-node/types";
import type { ExecuteCommandRequest } from "./generated/linuxcnc/v1/ExecuteCommandRequest";
import type { ExecuteCommandResponse__Output } from "./generated/linuxcnc/v1/ExecuteCommandResponse";
import type { MachineServiceClient } from "./generated/linuxcnc/v1/MachineService";

const waitPolicies = {
  accepted: "WAIT_POLICY_ACCEPTED",
  completed: "WAIT_POLICY_COMPLETED",
} as const;

function encodePosition(position: Position) {
  return { values: Array.from(position) };
}

const requestFor = (
  command: LinuxCncCommand,
  waitPolicy: CommandWaitPolicy,
): ExecuteCommandRequest => {
  const { type, ...payload } = command;
  if (type === "setTool") {
    const { offset, wearOffset, ...tool } = command.tool;
    return {
      command: type,
      setTool: {
        tool: {
          ...tool,
          ...(offset === undefined ? {} : { offset: encodePosition(offset) }),
          ...(wearOffset === undefined
            ? {}
            : { wearOffset: encodePosition(wearOffset) }),
        },
      },
      waitPolicy: waitPolicies[waitPolicy],
    };
  }
  return {
    command: type,
    [type]: payload,
    waitPolicy: waitPolicies[waitPolicy],
  } as ExecuteCommandRequest;
};

/** Execute the canonical command object through the generated machine client. */
export function executeCommand(
  client: MachineServiceClient,
  command: LinuxCncCommand,
  waitPolicy: CommandWaitPolicy,
  options?: grpc.CallOptions,
): Promise<ExecuteCommandResponse__Output> {
  return new Promise((resolve, reject) => {
    const callback: grpc.requestCallback<ExecuteCommandResponse__Output> = (
      error,
      response,
    ) => {
      if (error) reject(error);
      else if (response) resolve(response);
      else reject(new Error("executeCommand returned no response"));
    };
    const request = requestFor(command, waitPolicy);
    if (options) client.executeCommand(request, options, callback);
    else client.executeCommand(request, callback);
  });
}
