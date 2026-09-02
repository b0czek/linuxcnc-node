// Original file: proto/linuxcnc/v1/hal.proto

import type { HalItemRef as _linuxcnc_v1_HalItemRef, HalItemRef__Output as _linuxcnc_v1_HalItemRef__Output } from '../../linuxcnc/v1/HalItemRef';
import type { HalType as _linuxcnc_v1_HalType, HalType__Output as _linuxcnc_v1_HalType__Output } from '../../linuxcnc/v1/HalType';

export interface HalValueSubscriptionSlot {
  'slot'?: (number);
  'item'?: (_linuxcnc_v1_HalItemRef | null);
  'type'?: (_linuxcnc_v1_HalType);
}

export interface HalValueSubscriptionSlot__Output {
  'slot'?: (number);
  'item'?: (_linuxcnc_v1_HalItemRef__Output);
  'type'?: (_linuxcnc_v1_HalType__Output);
}
