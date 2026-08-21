// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { HalType as _linuxcnc_v1_HalType, HalType__Output as _linuxcnc_v1_HalType__Output } from '../../linuxcnc/v1/HalType';
import type { HalPinDirection as _linuxcnc_v1_HalPinDirection, HalPinDirection__Output as _linuxcnc_v1_HalPinDirection__Output } from '../../linuxcnc/v1/HalPinDirection';

export interface ComponentPin {
  'name'?: (string);
  'type'?: (_linuxcnc_v1_HalType);
  'direction'?: (_linuxcnc_v1_HalPinDirection);
  'prefix'?: (string);
}

export interface ComponentPin__Output {
  'name'?: (string);
  'type'?: (_linuxcnc_v1_HalType__Output);
  'direction'?: (_linuxcnc_v1_HalPinDirection__Output);
  'prefix'?: (string);
}
