// Original file: proto/linuxcnc/v1/program.proto

import type { Position as _linuxcnc_v1_Position, Position__Output as _linuxcnc_v1_Position__Output } from '../../linuxcnc/v1/Position';

export interface RigidTapData {
  'pos'?: (_linuxcnc_v1_Position | null);
  'scale'?: (number | string);
}

export interface RigidTapData__Output {
  'pos'?: (_linuxcnc_v1_Position__Output);
  'scale'?: (number);
}
