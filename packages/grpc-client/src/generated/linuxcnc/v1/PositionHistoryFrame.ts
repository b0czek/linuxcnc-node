// Original file: proto/linuxcnc/v1/websocket.proto

import type { FrameKind as _linuxcnc_v1_FrameKind, FrameKind__Output as _linuxcnc_v1_FrameKind__Output } from '../../linuxcnc/v1/FrameKind';
import type { Long } from '@grpc/proto-loader';

export interface PositionHistoryFrame {
  'kind'?: (_linuxcnc_v1_FrameKind);
  'generation'?: (number | string | Long);
  'firstSequence'?: (number | string | Long);
  'nextSequence'?: (number | string | Long);
  'replacementCount'?: (number);
  'values'?: (number | string)[];
}

export interface PositionHistoryFrame__Output {
  'kind'?: (_linuxcnc_v1_FrameKind__Output);
  'generation'?: (string);
  'firstSequence'?: (string);
  'nextSequence'?: (string);
  'replacementCount'?: (number);
  'values'?: (number)[];
}
