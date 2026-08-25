// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { HalValueSubscriptionSlot as _linuxcnc_v1_HalValueSubscriptionSlot, HalValueSubscriptionSlot__Output as _linuxcnc_v1_HalValueSubscriptionSlot__Output } from '../../linuxcnc/v1/HalValueSubscriptionSlot';
import type { Long } from '@grpc/proto-loader';

export interface HalValueSubscription {
  'subscriptionId'?: (string);
  'websocketPath'?: (string);
  'revision'?: (number | string | Long);
  'samplePeriodMs'?: (number);
  'slots'?: (_linuxcnc_v1_HalValueSubscriptionSlot)[];
}

export interface HalValueSubscription__Output {
  'subscriptionId'?: (string);
  'websocketPath'?: (string);
  'revision'?: (string);
  'samplePeriodMs'?: (number);
  'slots'?: (_linuxcnc_v1_HalValueSubscriptionSlot__Output)[];
}
