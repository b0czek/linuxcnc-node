// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { AxisStat as _linuxcnc_v1_AxisStat, AxisStat__Output as _linuxcnc_v1_AxisStat__Output } from '../../linuxcnc/v1/AxisStat';

export interface IndexedAxisDelta {
  'index'?: (number);
  'value'?: (_linuxcnc_v1_AxisStat | null);
}

export interface IndexedAxisDelta__Output {
  'index'?: (number);
  'value'?: (_linuxcnc_v1_AxisStat__Output);
}
