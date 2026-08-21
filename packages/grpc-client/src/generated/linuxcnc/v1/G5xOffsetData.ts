// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { Position as _linuxcnc_v1_Position, Position__Output as _linuxcnc_v1_Position__Output } from '../../linuxcnc/v1/Position';

export interface G5xOffsetData {
  'origin'?: (number);
  'offset'?: (_linuxcnc_v1_Position | null);
}

export interface G5xOffsetData__Output {
  'origin'?: (number);
  'offset'?: (_linuxcnc_v1_Position__Output);
}
