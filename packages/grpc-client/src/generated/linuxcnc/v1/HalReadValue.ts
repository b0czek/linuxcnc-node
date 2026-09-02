// Original file: proto/linuxcnc/v1/hal.proto

import type { HalItemRef as _linuxcnc_v1_HalItemRef, HalItemRef__Output as _linuxcnc_v1_HalItemRef__Output } from '../../linuxcnc/v1/HalItemRef';
import type { HalScalar as _linuxcnc_v1_HalScalar, HalScalar__Output as _linuxcnc_v1_HalScalar__Output } from '../../linuxcnc/v1/HalScalar';

export interface HalReadValue {
  'item'?: (_linuxcnc_v1_HalItemRef | null);
  'value'?: (_linuxcnc_v1_HalScalar | null);
}

export interface HalReadValue__Output {
  'item'?: (_linuxcnc_v1_HalItemRef__Output);
  'value'?: (_linuxcnc_v1_HalScalar__Output);
}
