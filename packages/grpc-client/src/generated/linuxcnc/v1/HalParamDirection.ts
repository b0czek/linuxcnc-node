// Original file: proto/linuxcnc/v1/hal.proto

export const HalParamDirection = {
  HAL_PARAM_DIRECTION_UNSPECIFIED: 0,
  HAL_PARAM_DIRECTION_RO: 1,
  HAL_PARAM_DIRECTION_RW: 2,
} as const;

export type HalParamDirection =
  | 'HAL_PARAM_DIRECTION_UNSPECIFIED'
  | 0
  | 'HAL_PARAM_DIRECTION_RO'
  | 1
  | 'HAL_PARAM_DIRECTION_RW'
  | 2

export type HalParamDirection__Output = typeof HalParamDirection[keyof typeof HalParamDirection]
