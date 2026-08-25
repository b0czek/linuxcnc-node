// Original file: proto/linuxcnc/v1/program.proto

export const Plane = {
  PLANE_UNSPECIFIED: 0,
  PLANE_XY: 1,
  PLANE_YZ: 2,
  PLANE_XZ: 3,
  PLANE_UV: 4,
  PLANE_VW: 5,
  PLANE_UW: 6,
} as const;

export type Plane =
  | 'PLANE_UNSPECIFIED'
  | 0
  | 'PLANE_XY'
  | 1
  | 'PLANE_YZ'
  | 2
  | 'PLANE_XZ'
  | 3
  | 'PLANE_UV'
  | 4
  | 'PLANE_VW'
  | 5
  | 'PLANE_UW'
  | 6

export type Plane__Output = typeof Plane[keyof typeof Plane]
