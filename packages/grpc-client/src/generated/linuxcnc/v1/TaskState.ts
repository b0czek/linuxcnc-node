// Original file: proto/linuxcnc/v1/machine.proto

export const TaskState = {
  TASK_STATE_UNSPECIFIED: 0,
  TASK_STATE_ESTOP: 1,
  TASK_STATE_ESTOP_RESET: 2,
  TASK_STATE_OFF: 3,
  TASK_STATE_ON: 4,
} as const;

export type TaskState =
  | 'TASK_STATE_UNSPECIFIED'
  | 0
  | 'TASK_STATE_ESTOP'
  | 1
  | 'TASK_STATE_ESTOP_RESET'
  | 2
  | 'TASK_STATE_OFF'
  | 3
  | 'TASK_STATE_ON'
  | 4

export type TaskState__Output = typeof TaskState[keyof typeof TaskState]
