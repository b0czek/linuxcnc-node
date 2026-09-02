// Original file: proto/linuxcnc/v1/machine.proto

export const RcsStatus = {
  RCS_STATUS_UNSPECIFIED: 0,
  RCS_STATUS_UNINITIALIZED: -1,
  RCS_STATUS_DONE: 1,
  RCS_STATUS_EXEC: 2,
  RCS_STATUS_ERROR: 3,
} as const;

export type RcsStatus =
  | 'RCS_STATUS_UNSPECIFIED'
  | 0
  | 'RCS_STATUS_UNINITIALIZED'
  | -1
  | 'RCS_STATUS_DONE'
  | 1
  | 'RCS_STATUS_EXEC'
  | 2
  | 'RCS_STATUS_ERROR'
  | 3

export type RcsStatus__Output = typeof RcsStatus[keyof typeof RcsStatus]
