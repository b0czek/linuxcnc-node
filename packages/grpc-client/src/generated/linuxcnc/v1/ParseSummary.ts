// Original file: proto/linuxcnc/v1/websocket.proto

import type { Extents as _linuxcnc_v1_Extents, Extents__Output as _linuxcnc_v1_Extents__Output } from '../../linuxcnc/v1/Extents';
import type { Long } from '@grpc/proto-loader';

export interface ParseSummary {
  'extents'?: (_linuxcnc_v1_Extents | null);
  'operationCount'?: (number | string | Long);
}

export interface ParseSummary__Output {
  'extents'?: (_linuxcnc_v1_Extents__Output);
  'operationCount'?: (string);
}
