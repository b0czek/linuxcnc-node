// Original file: proto/linuxcnc/v1/common.proto

export const HalItemKind = {
  HAL_ITEM_KIND_UNSPECIFIED: 0,
  HAL_ITEM_KIND_PIN: 1,
  HAL_ITEM_KIND_PARAM: 2,
  HAL_ITEM_KIND_SIGNAL: 3,
} as const;

export type HalItemKind =
  | 'HAL_ITEM_KIND_UNSPECIFIED'
  | 0
  | 'HAL_ITEM_KIND_PIN'
  | 1
  | 'HAL_ITEM_KIND_PARAM'
  | 2
  | 'HAL_ITEM_KIND_SIGNAL'
  | 3

export type HalItemKind__Output = typeof HalItemKind[keyof typeof HalItemKind]
