// Original file: proto/linuxcnc/v1/machine.proto

import type { OrientState as _linuxcnc_v1_OrientState, OrientState__Output as _linuxcnc_v1_OrientState__Output } from '../../linuxcnc/v1/OrientState';

export interface SpindleStat {
  'speed'?: (number | string);
  'feedback'?: (number | string);
  'override'?: (number | string);
  'cssMaximum'?: (number | string);
  'cssFactor'?: (number | string);
  'direction'?: (number);
  'brake'?: (boolean);
  'increasing'?: (number);
  'enabled'?: (boolean);
  'orientState'?: (_linuxcnc_v1_OrientState);
  'orientFault'?: (number);
  'spindleOverrideEnabled'?: (boolean);
  'homed'?: (boolean);
}

export interface SpindleStat__Output {
  'speed'?: (number);
  'feedback'?: (number);
  'override'?: (number);
  'cssMaximum'?: (number);
  'cssFactor'?: (number);
  'direction'?: (number);
  'brake'?: (boolean);
  'increasing'?: (number);
  'enabled'?: (boolean);
  'orientState'?: (_linuxcnc_v1_OrientState__Output);
  'orientFault'?: (number);
  'spindleOverrideEnabled'?: (boolean);
  'homed'?: (boolean);
}
