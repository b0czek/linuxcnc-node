// Original file: proto/linuxcnc/v1/linuxcnc.proto

export const AxisName = {
  AXIS_NAME_UNSPECIFIED: 0,
  AXIS_NAME_X: 1,
  AXIS_NAME_Y: 2,
  AXIS_NAME_Z: 3,
  AXIS_NAME_A: 4,
  AXIS_NAME_B: 5,
  AXIS_NAME_C: 6,
  AXIS_NAME_U: 7,
  AXIS_NAME_V: 8,
  AXIS_NAME_W: 9,
} as const;

export type AxisName =
  | 'AXIS_NAME_UNSPECIFIED'
  | 0
  | 'AXIS_NAME_X'
  | 1
  | 'AXIS_NAME_Y'
  | 2
  | 'AXIS_NAME_Z'
  | 3
  | 'AXIS_NAME_A'
  | 4
  | 'AXIS_NAME_B'
  | 5
  | 'AXIS_NAME_C'
  | 6
  | 'AXIS_NAME_U'
  | 7
  | 'AXIS_NAME_V'
  | 8
  | 'AXIS_NAME_W'
  | 9

export type AxisName__Output = typeof AxisName[keyof typeof AxisName]
