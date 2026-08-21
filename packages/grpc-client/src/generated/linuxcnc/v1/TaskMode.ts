// Original file: proto/linuxcnc/v1/linuxcnc.proto

export const TaskMode = {
  TASK_MODE_UNSPECIFIED: 0,
  TASK_MODE_MANUAL: 1,
  TASK_MODE_AUTO: 2,
  TASK_MODE_MDI: 3,
} as const;

export type TaskMode =
  | 'TASK_MODE_UNSPECIFIED'
  | 0
  | 'TASK_MODE_MANUAL'
  | 1
  | 'TASK_MODE_AUTO'
  | 2
  | 'TASK_MODE_MDI'
  | 3

export type TaskMode__Output = typeof TaskMode[keyof typeof TaskMode]
