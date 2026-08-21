// Original file: proto/linuxcnc/v1/linuxcnc.proto

export const PositionBatchKind = {
  POSITION_BATCH_KIND_UNSPECIFIED: 0,
  POSITION_BATCH_KIND_REPLACEMENT: 1,
  POSITION_BATCH_KIND_DELTA: 2,
} as const;

export type PositionBatchKind =
  | 'POSITION_BATCH_KIND_UNSPECIFIED'
  | 0
  | 'POSITION_BATCH_KIND_REPLACEMENT'
  | 1
  | 'POSITION_BATCH_KIND_DELTA'
  | 2

export type PositionBatchKind__Output = typeof PositionBatchKind[keyof typeof PositionBatchKind]
