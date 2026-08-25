// Original file: proto/linuxcnc/v1/hal.proto

import type { HalScalar as _linuxcnc_v1_HalScalar, HalScalar__Output as _linuxcnc_v1_HalScalar__Output } from '../../linuxcnc/v1/HalScalar';
import type { HalType as _linuxcnc_v1_HalType, HalType__Output as _linuxcnc_v1_HalType__Output } from '../../linuxcnc/v1/HalType';
import type { HalPinDirection as _linuxcnc_v1_HalPinDirection, HalPinDirection__Output as _linuxcnc_v1_HalPinDirection__Output } from '../../linuxcnc/v1/HalPinDirection';

export interface HalPinInfo {
  'name'?: (string);
  'value'?: (_linuxcnc_v1_HalScalar | null);
  'type'?: (_linuxcnc_v1_HalType);
  'direction'?: (_linuxcnc_v1_HalPinDirection);
  'ownerId'?: (number);
  'signalName'?: (string);
}

export interface HalPinInfo__Output {
  'name'?: (string);
  'value'?: (_linuxcnc_v1_HalScalar__Output);
  'type'?: (_linuxcnc_v1_HalType__Output);
  'direction'?: (_linuxcnc_v1_HalPinDirection__Output);
  'ownerId'?: (number);
  'signalName'?: (string);
}
