// Original file: proto/linuxcnc/v1/machine.proto

export const WaitPolicy = {
  WAIT_POLICY_UNSPECIFIED: 0,
  WAIT_POLICY_ACCEPTED: 1,
  WAIT_POLICY_COMPLETED: 2,
} as const;

export type WaitPolicy =
  | 'WAIT_POLICY_UNSPECIFIED'
  | 0
  | 'WAIT_POLICY_ACCEPTED'
  | 1
  | 'WAIT_POLICY_COMPLETED'
  | 2

export type WaitPolicy__Output = typeof WaitPolicy[keyof typeof WaitPolicy]
