// Original file: proto/linuxcnc/v1/machine.proto

import type { JointType as _linuxcnc_v1_JointType, JointType__Output as _linuxcnc_v1_JointType__Output } from '../../linuxcnc/v1/JointType';

export interface JointStat {
  'jointType'?: (_linuxcnc_v1_JointType);
  'units'?: (number | string);
  'backlash'?: (number | string);
  'minPositionLimit'?: (number | string);
  'maxPositionLimit'?: (number | string);
  'minFerror'?: (number | string);
  'maxFerror'?: (number | string);
  'ferrorCurrent'?: (number | string);
  'ferrorHighMark'?: (number | string);
  'output'?: (number | string);
  'input'?: (number | string);
  'velocity'?: (number | string);
  'inPosition'?: (boolean);
  'homing'?: (boolean);
  'homed'?: (boolean);
  'fault'?: (boolean);
  'enabled'?: (boolean);
  'minSoftLimit'?: (boolean);
  'maxSoftLimit'?: (boolean);
  'minHardLimit'?: (boolean);
  'maxHardLimit'?: (boolean);
  'overrideLimits'?: (boolean);
}

export interface JointStat__Output {
  'jointType'?: (_linuxcnc_v1_JointType__Output);
  'units'?: (number);
  'backlash'?: (number);
  'minPositionLimit'?: (number);
  'maxPositionLimit'?: (number);
  'minFerror'?: (number);
  'maxFerror'?: (number);
  'ferrorCurrent'?: (number);
  'ferrorHighMark'?: (number);
  'output'?: (number);
  'input'?: (number);
  'velocity'?: (number);
  'inPosition'?: (boolean);
  'homing'?: (boolean);
  'homed'?: (boolean);
  'fault'?: (boolean);
  'enabled'?: (boolean);
  'minSoftLimit'?: (boolean);
  'maxSoftLimit'?: (boolean);
  'minHardLimit'?: (boolean);
  'maxHardLimit'?: (boolean);
  'overrideLimits'?: (boolean);
}
