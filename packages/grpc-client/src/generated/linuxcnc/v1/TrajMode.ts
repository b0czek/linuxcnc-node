// Original file: proto/linuxcnc/v1/linuxcnc.proto

export const TrajMode = {
  TRAJ_MODE_UNSPECIFIED: 0,
  TRAJ_MODE_FREE: 1,
  TRAJ_MODE_COORD: 2,
  TRAJ_MODE_TELEOP: 3,
} as const;

export type TrajMode =
  | 'TRAJ_MODE_UNSPECIFIED'
  | 0
  | 'TRAJ_MODE_FREE'
  | 1
  | 'TRAJ_MODE_COORD'
  | 2
  | 'TRAJ_MODE_TELEOP'
  | 3

export type TrajMode__Output = typeof TrajMode[keyof typeof TrajMode]
