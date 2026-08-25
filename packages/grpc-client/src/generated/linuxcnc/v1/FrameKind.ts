// Original file: proto/linuxcnc/v1/websocket.proto

export const FrameKind = {
  FRAME_KIND_UNSPECIFIED: 0,
  FRAME_KIND_REPLACEMENT: 1,
  FRAME_KIND_DELTA: 2,
} as const;

export type FrameKind =
  | 'FRAME_KIND_UNSPECIFIED'
  | 0
  | 'FRAME_KIND_REPLACEMENT'
  | 1
  | 'FRAME_KIND_DELTA'
  | 2

export type FrameKind__Output = typeof FrameKind[keyof typeof FrameKind]
