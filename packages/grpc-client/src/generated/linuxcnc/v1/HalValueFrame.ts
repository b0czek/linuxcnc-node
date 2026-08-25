// Original file: proto/linuxcnc/v1/websocket.proto

import type { FrameKind as _linuxcnc_v1_FrameKind, FrameKind__Output as _linuxcnc_v1_FrameKind__Output } from '../../linuxcnc/v1/FrameKind';
import type { HalValueFrameEntry as _linuxcnc_v1_HalValueFrameEntry, HalValueFrameEntry__Output as _linuxcnc_v1_HalValueFrameEntry__Output } from '../../linuxcnc/v1/HalValueFrameEntry';
import type { Long } from '@grpc/proto-loader';

export interface HalValueFrame {
  'kind'?: (_linuxcnc_v1_FrameKind);
  'revision'?: (number | string | Long);
  'sequence'?: (number | string | Long);
  'entries'?: (_linuxcnc_v1_HalValueFrameEntry)[];
}

export interface HalValueFrame__Output {
  'kind'?: (_linuxcnc_v1_FrameKind__Output);
  'revision'?: (string);
  'sequence'?: (string);
  'entries'?: (_linuxcnc_v1_HalValueFrameEntry__Output)[];
}
