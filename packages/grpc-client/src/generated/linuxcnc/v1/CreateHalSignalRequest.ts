// Original file: proto/linuxcnc/v1/hal.proto

import type { HalType as _linuxcnc_v1_HalType, HalType__Output as _linuxcnc_v1_HalType__Output } from '../../linuxcnc/v1/HalType';

export interface CreateHalSignalRequest {
  'name'?: (string);
  'type'?: (_linuxcnc_v1_HalType);
}

export interface CreateHalSignalRequest__Output {
  'name'?: (string);
  'type'?: (_linuxcnc_v1_HalType__Output);
}
