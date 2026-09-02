// Original file: proto/linuxcnc/v1/hal.proto

import type { HalComponentKind as _linuxcnc_v1_HalComponentKind, HalComponentKind__Output as _linuxcnc_v1_HalComponentKind__Output } from '../../linuxcnc/v1/HalComponentKind';

export interface HalComponentInfo {
  'id'?: (number);
  'name'?: (string);
  'kind'?: (_linuxcnc_v1_HalComponentKind);
  'ready'?: (boolean);
  'pid'?: (number);
}

export interface HalComponentInfo__Output {
  'id'?: (number);
  'name'?: (string);
  'kind'?: (_linuxcnc_v1_HalComponentKind__Output);
  'ready'?: (boolean);
  'pid'?: (number);
}
