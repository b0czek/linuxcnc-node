// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { HalScalar as _linuxcnc_v1_HalScalar, HalScalar__Output as _linuxcnc_v1_HalScalar__Output } from '../../linuxcnc/v1/HalScalar';
import type { HalType as _linuxcnc_v1_HalType, HalType__Output as _linuxcnc_v1_HalType__Output } from '../../linuxcnc/v1/HalType';

export interface HalSignalInfo {
  'name'?: (string);
  'value'?: (_linuxcnc_v1_HalScalar | null);
  'type'?: (_linuxcnc_v1_HalType);
  'driver'?: (string);
  'readers'?: (number);
  'writers'?: (number);
  'bidirs'?: (number);
}

export interface HalSignalInfo__Output {
  'name'?: (string);
  'value'?: (_linuxcnc_v1_HalScalar__Output);
  'type'?: (_linuxcnc_v1_HalType__Output);
  'driver'?: (string);
  'readers'?: (number);
  'writers'?: (number);
  'bidirs'?: (number);
}
