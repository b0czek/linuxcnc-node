// Original file: proto/linuxcnc/v1/scope.proto

import type { HalItemRef as _linuxcnc_v1_HalItemRef, HalItemRef__Output as _linuxcnc_v1_HalItemRef__Output } from '../../linuxcnc/v1/HalItemRef';

export interface ScopeChannelConfig {
  'index'?: (number);
  'item'?: (_linuxcnc_v1_HalItemRef | null);
  'enabled'?: (boolean);
}

export interface ScopeChannelConfig__Output {
  'index'?: (number);
  'item'?: (_linuxcnc_v1_HalItemRef__Output);
  'enabled'?: (boolean);
}
