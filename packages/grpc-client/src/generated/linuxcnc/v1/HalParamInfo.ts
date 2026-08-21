// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { HalScalar as _linuxcnc_v1_HalScalar, HalScalar__Output as _linuxcnc_v1_HalScalar__Output } from '../../linuxcnc/v1/HalScalar';
import type { HalType as _linuxcnc_v1_HalType, HalType__Output as _linuxcnc_v1_HalType__Output } from '../../linuxcnc/v1/HalType';
import type { HalParamDirection as _linuxcnc_v1_HalParamDirection, HalParamDirection__Output as _linuxcnc_v1_HalParamDirection__Output } from '../../linuxcnc/v1/HalParamDirection';

export interface HalParamInfo {
  'name'?: (string);
  'value'?: (_linuxcnc_v1_HalScalar | null);
  'type'?: (_linuxcnc_v1_HalType);
  'direction'?: (_linuxcnc_v1_HalParamDirection);
  'ownerId'?: (number);
}

export interface HalParamInfo__Output {
  'name'?: (string);
  'value'?: (_linuxcnc_v1_HalScalar__Output);
  'type'?: (_linuxcnc_v1_HalType__Output);
  'direction'?: (_linuxcnc_v1_HalParamDirection__Output);
  'ownerId'?: (number);
}
