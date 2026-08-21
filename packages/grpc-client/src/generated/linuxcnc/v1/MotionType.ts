// Original file: proto/linuxcnc/v1/linuxcnc.proto

export const MotionType = {
  MOTION_TYPE_NONE: 0,
  MOTION_TYPE_TRAVERSE: 1,
  MOTION_TYPE_FEED: 2,
  MOTION_TYPE_ARC: 3,
  MOTION_TYPE_TOOLCHANGE: 4,
  MOTION_TYPE_PROBING: 5,
  MOTION_TYPE_INDEXROTARY: 6,
} as const;

export type MotionType =
  | 'MOTION_TYPE_NONE'
  | 0
  | 'MOTION_TYPE_TRAVERSE'
  | 1
  | 'MOTION_TYPE_FEED'
  | 2
  | 'MOTION_TYPE_ARC'
  | 3
  | 'MOTION_TYPE_TOOLCHANGE'
  | 4
  | 'MOTION_TYPE_PROBING'
  | 5
  | 'MOTION_TYPE_INDEXROTARY'
  | 6

export type MotionType__Output = typeof MotionType[keyof typeof MotionType]
