// Original file: proto/linuxcnc/v1/linuxcnc.proto

export const JointType = {
  JOINT_TYPE_UNSPECIFIED: 0,
  JOINT_TYPE_LINEAR: 1,
  JOINT_TYPE_ANGULAR: 2,
} as const;

export type JointType =
  | 'JOINT_TYPE_UNSPECIFIED'
  | 0
  | 'JOINT_TYPE_LINEAR'
  | 1
  | 'JOINT_TYPE_ANGULAR'
  | 2

export type JointType__Output = typeof JointType[keyof typeof JointType]
