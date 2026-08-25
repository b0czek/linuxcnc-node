// Original file: proto/linuxcnc/v1/hal.proto

import type { HalType as _linuxcnc_v1_HalType, HalType__Output as _linuxcnc_v1_HalType__Output } from '../../linuxcnc/v1/HalType';
import type { HalParamDirection as _linuxcnc_v1_HalParamDirection, HalParamDirection__Output as _linuxcnc_v1_HalParamDirection__Output } from '../../linuxcnc/v1/HalParamDirection';

export interface ComponentParameter {
  'name'?: (string);
  'type'?: (_linuxcnc_v1_HalType);
  'direction'?: (_linuxcnc_v1_HalParamDirection);
  'prefix'?: (string);
}

export interface ComponentParameter__Output {
  'name'?: (string);
  'type'?: (_linuxcnc_v1_HalType__Output);
  'direction'?: (_linuxcnc_v1_HalParamDirection__Output);
  'prefix'?: (string);
}
