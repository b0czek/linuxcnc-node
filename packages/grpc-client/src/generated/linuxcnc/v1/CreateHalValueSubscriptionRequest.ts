// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { HalItemRef as _linuxcnc_v1_HalItemRef, HalItemRef__Output as _linuxcnc_v1_HalItemRef__Output } from '../../linuxcnc/v1/HalItemRef';

export interface CreateHalValueSubscriptionRequest {
  'items'?: (_linuxcnc_v1_HalItemRef)[];
  'samplePeriodMs'?: (number);
}

export interface CreateHalValueSubscriptionRequest__Output {
  'items'?: (_linuxcnc_v1_HalItemRef__Output)[];
  'samplePeriodMs'?: (number);
}
