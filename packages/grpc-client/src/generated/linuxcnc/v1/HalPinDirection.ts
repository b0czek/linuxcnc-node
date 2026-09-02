// Original file: proto/linuxcnc/v1/hal.proto

export const HalPinDirection = {
  HAL_PIN_DIRECTION_UNSPECIFIED: 0,
  HAL_PIN_DIRECTION_IN: 1,
  HAL_PIN_DIRECTION_OUT: 2,
  HAL_PIN_DIRECTION_IO: 3,
} as const;

export type HalPinDirection =
  | 'HAL_PIN_DIRECTION_UNSPECIFIED'
  | 0
  | 'HAL_PIN_DIRECTION_IN'
  | 1
  | 'HAL_PIN_DIRECTION_OUT'
  | 2
  | 'HAL_PIN_DIRECTION_IO'
  | 3

export type HalPinDirection__Output = typeof HalPinDirection[keyof typeof HalPinDirection]
