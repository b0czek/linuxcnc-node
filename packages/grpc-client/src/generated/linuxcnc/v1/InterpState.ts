// Original file: proto/linuxcnc/v1/linuxcnc.proto

export const InterpState = {
  INTERP_STATE_UNSPECIFIED: 0,
  INTERP_STATE_IDLE: 1,
  INTERP_STATE_READING: 2,
  INTERP_STATE_PAUSED: 3,
  INTERP_STATE_WAITING: 4,
} as const;

export type InterpState =
  | 'INTERP_STATE_UNSPECIFIED'
  | 0
  | 'INTERP_STATE_IDLE'
  | 1
  | 'INTERP_STATE_READING'
  | 2
  | 'INTERP_STATE_PAUSED'
  | 3
  | 'INTERP_STATE_WAITING'
  | 4

export type InterpState__Output = typeof InterpState[keyof typeof InterpState]
