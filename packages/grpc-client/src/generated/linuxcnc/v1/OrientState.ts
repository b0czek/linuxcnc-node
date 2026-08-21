// Original file: proto/linuxcnc/v1/linuxcnc.proto

export const OrientState = {
  ORIENT_STATE_NONE: 0,
  ORIENT_STATE_COMPLETE: 1,
  ORIENT_STATE_IN_PROGRESS: 2,
  ORIENT_STATE_FAULTED: 3,
} as const;

export type OrientState =
  | 'ORIENT_STATE_NONE'
  | 0
  | 'ORIENT_STATE_COMPLETE'
  | 1
  | 'ORIENT_STATE_IN_PROGRESS'
  | 2
  | 'ORIENT_STATE_FAULTED'
  | 3

export type OrientState__Output = typeof OrientState[keyof typeof OrientState]
