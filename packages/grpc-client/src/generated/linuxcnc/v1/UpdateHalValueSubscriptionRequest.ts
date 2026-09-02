// Original file: proto/linuxcnc/v1/hal.proto

import type { HalItemRef as _linuxcnc_v1_HalItemRef, HalItemRef__Output as _linuxcnc_v1_HalItemRef__Output } from '../../linuxcnc/v1/HalItemRef';
import type { Long } from '@grpc/proto-loader';

export interface UpdateHalValueSubscriptionRequest {
  'subscriptionId'?: (string);
  'expectedRevision'?: (number | string | Long);
  'items'?: (_linuxcnc_v1_HalItemRef)[];
  'samplePeriodMs'?: (number);
}

export interface UpdateHalValueSubscriptionRequest__Output {
  'subscriptionId'?: (string);
  'expectedRevision'?: (string);
  'items'?: (_linuxcnc_v1_HalItemRef__Output)[];
  'samplePeriodMs'?: (number);
}
