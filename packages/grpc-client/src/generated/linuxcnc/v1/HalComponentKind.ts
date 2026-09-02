// Original file: proto/linuxcnc/v1/hal.proto

export const HalComponentKind = {
  HAL_COMPONENT_KIND_UNSPECIFIED: 0,
  HAL_COMPONENT_KIND_USER: 1,
  HAL_COMPONENT_KIND_REALTIME: 2,
  HAL_COMPONENT_KIND_OTHER: 3,
  HAL_COMPONENT_KIND_UNKNOWN: 4,
} as const;

export type HalComponentKind =
  | 'HAL_COMPONENT_KIND_UNSPECIFIED'
  | 0
  | 'HAL_COMPONENT_KIND_USER'
  | 1
  | 'HAL_COMPONENT_KIND_REALTIME'
  | 2
  | 'HAL_COMPONENT_KIND_OTHER'
  | 3
  | 'HAL_COMPONENT_KIND_UNKNOWN'
  | 4

export type HalComponentKind__Output = typeof HalComponentKind[keyof typeof HalComponentKind]
