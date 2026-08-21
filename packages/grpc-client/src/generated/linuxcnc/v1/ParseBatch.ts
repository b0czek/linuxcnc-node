// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { GCodeOperation as _linuxcnc_v1_GCodeOperation, GCodeOperation__Output as _linuxcnc_v1_GCodeOperation__Output } from '../../linuxcnc/v1/GCodeOperation';

export interface ParseBatch {
  'operations'?: (_linuxcnc_v1_GCodeOperation)[];
}

export interface ParseBatch__Output {
  'operations'?: (_linuxcnc_v1_GCodeOperation__Output)[];
}
