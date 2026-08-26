import type { CommandWaitPolicy, LinuxCncCommand } from "@linuxcnc-node/types";
import type { ExecuteCommandRequest } from "./generated/linuxcnc/v1/ExecuteCommandRequest";
import type { ExecuteCommandResponse__Output } from "./generated/linuxcnc/v1/ExecuteCommandResponse";
import type { MachineServiceClient } from "./generated/linuxcnc/v1/MachineService";

const waitPolicies = {
  accepted: "WAIT_POLICY_ACCEPTED",
  completed: "WAIT_POLICY_COMPLETED",
} as const;

const requestFor = (
  command: LinuxCncCommand,
  waitPolicy: CommandWaitPolicy,
): ExecuteCommandRequest => {
  const { type, ...payload } = command;
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
): Promise<ExecuteCommandResponse__Output> {
  return new Promise((resolve, reject) => {
    client.executeCommand(
      requestFor(command, waitPolicy),
      (error, response) => {
        if (error) reject(error);
        else if (response) resolve(response);
        else reject(new Error("executeCommand returned no response"));
      },
    );
  });
}
