// Original file: proto/linuxcnc/v1/machine.proto

import type { TrajectoryStat as _linuxcnc_v1_TrajectoryStat, TrajectoryStat__Output as _linuxcnc_v1_TrajectoryStat__Output } from '../../linuxcnc/v1/TrajectoryStat';
import type { IndexedJointDelta as _linuxcnc_v1_IndexedJointDelta, IndexedJointDelta__Output as _linuxcnc_v1_IndexedJointDelta__Output } from '../../linuxcnc/v1/IndexedJointDelta';
import type { IndexedAxisDelta as _linuxcnc_v1_IndexedAxisDelta, IndexedAxisDelta__Output as _linuxcnc_v1_IndexedAxisDelta__Output } from '../../linuxcnc/v1/IndexedAxisDelta';
import type { IndexedSpindleDelta as _linuxcnc_v1_IndexedSpindleDelta, IndexedSpindleDelta__Output as _linuxcnc_v1_IndexedSpindleDelta__Output } from '../../linuxcnc/v1/IndexedSpindleDelta';

export interface MotionStatDelta {
  'traj'?: (_linuxcnc_v1_TrajectoryStat | null);
  'joint'?: (_linuxcnc_v1_IndexedJointDelta)[];
  'axis'?: (_linuxcnc_v1_IndexedAxisDelta)[];
  'spindle'?: (_linuxcnc_v1_IndexedSpindleDelta)[];
  'digitalInput'?: (number)[];
  'digitalOutput'?: (number)[];
  'analogInput'?: (number | string)[];
  'analogOutput'?: (number | string)[];
  'replaceDigitalInput'?: (boolean);
  'replaceDigitalOutput'?: (boolean);
  'replaceAnalogInput'?: (boolean);
  'replaceAnalogOutput'?: (boolean);
}

export interface MotionStatDelta__Output {
  'traj'?: (_linuxcnc_v1_TrajectoryStat__Output);
  'joint'?: (_linuxcnc_v1_IndexedJointDelta__Output)[];
  'axis'?: (_linuxcnc_v1_IndexedAxisDelta__Output)[];
  'spindle'?: (_linuxcnc_v1_IndexedSpindleDelta__Output)[];
  'digitalInput'?: (number)[];
  'digitalOutput'?: (number)[];
  'analogInput'?: (number)[];
  'analogOutput'?: (number)[];
  'replaceDigitalInput'?: (boolean);
  'replaceDigitalOutput'?: (boolean);
  'replaceAnalogInput'?: (boolean);
  'replaceAnalogOutput'?: (boolean);
}
