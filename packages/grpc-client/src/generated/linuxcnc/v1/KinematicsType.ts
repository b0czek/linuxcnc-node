// Original file: proto/linuxcnc/v1/linuxcnc.proto

export const KinematicsType = {
  KINEMATICS_TYPE_UNSPECIFIED: 0,
  KINEMATICS_TYPE_IDENTITY: 1,
  KINEMATICS_TYPE_FORWARD_ONLY: 2,
  KINEMATICS_TYPE_INVERSE_ONLY: 3,
  KINEMATICS_TYPE_BOTH: 4,
} as const;

export type KinematicsType =
  | 'KINEMATICS_TYPE_UNSPECIFIED'
  | 0
  | 'KINEMATICS_TYPE_IDENTITY'
  | 1
  | 'KINEMATICS_TYPE_FORWARD_ONLY'
  | 2
  | 'KINEMATICS_TYPE_INVERSE_ONLY'
  | 3
  | 'KINEMATICS_TYPE_BOTH'
  | 4

export type KinematicsType__Output = typeof KinematicsType[keyof typeof KinematicsType]
