// Original file: proto/linuxcnc/v1/common.proto

export const HalType = {
  HAL_TYPE_UNSPECIFIED: 0,
  HAL_TYPE_BIT: 1,
  HAL_TYPE_FLOAT: 2,
  HAL_TYPE_S32: 3,
  HAL_TYPE_U32: 4,
  HAL_TYPE_S64: 5,
  HAL_TYPE_U64: 6,
} as const;

export type HalType =
  | 'HAL_TYPE_UNSPECIFIED'
  | 0
  | 'HAL_TYPE_BIT'
  | 1
  | 'HAL_TYPE_FLOAT'
  | 2
  | 'HAL_TYPE_S32'
  | 3
  | 'HAL_TYPE_U32'
  | 4
  | 'HAL_TYPE_S64'
  | 5
  | 'HAL_TYPE_U64'
  | 6

export type HalType__Output = typeof HalType[keyof typeof HalType]
