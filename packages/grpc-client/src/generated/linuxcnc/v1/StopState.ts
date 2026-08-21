// Original file: proto/linuxcnc/v1/linuxcnc.proto

export const StopState = {
  STOP_STATE_IDLE: 0,
  STOP_STATE_STOPPING: 1,
  STOP_STATE_STOPPED: 2,
  STOP_STATE_STARTING: 3,
} as const;

export type StopState =
  | 'STOP_STATE_IDLE'
  | 0
  | 'STOP_STATE_STOPPING'
  | 1
  | 'STOP_STATE_STOPPED'
  | 2
  | 'STOP_STATE_STARTING'
  | 3

export type StopState__Output = typeof StopState[keyof typeof StopState]
