// Original file: proto/linuxcnc/v1/machine.proto

import type { SpindleStat as _linuxcnc_v1_SpindleStat, SpindleStat__Output as _linuxcnc_v1_SpindleStat__Output } from '../../linuxcnc/v1/SpindleStat';

export interface IndexedSpindleDelta {
  'index'?: (number);
  'value'?: (_linuxcnc_v1_SpindleStat | null);
}

export interface IndexedSpindleDelta__Output {
  'index'?: (number);
  'value'?: (_linuxcnc_v1_SpindleStat__Output);
}
