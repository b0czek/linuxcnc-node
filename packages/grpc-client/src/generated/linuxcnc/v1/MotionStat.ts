// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { TrajectoryStat as _linuxcnc_v1_TrajectoryStat, TrajectoryStat__Output as _linuxcnc_v1_TrajectoryStat__Output } from '../../linuxcnc/v1/TrajectoryStat';
import type { JointStat as _linuxcnc_v1_JointStat, JointStat__Output as _linuxcnc_v1_JointStat__Output } from '../../linuxcnc/v1/JointStat';
import type { AxisStat as _linuxcnc_v1_AxisStat, AxisStat__Output as _linuxcnc_v1_AxisStat__Output } from '../../linuxcnc/v1/AxisStat';
import type { SpindleStat as _linuxcnc_v1_SpindleStat, SpindleStat__Output as _linuxcnc_v1_SpindleStat__Output } from '../../linuxcnc/v1/SpindleStat';

export interface MotionStat {
  'traj'?: (_linuxcnc_v1_TrajectoryStat | null);
  'joint'?: (_linuxcnc_v1_JointStat)[];
  'axis'?: (_linuxcnc_v1_AxisStat)[];
  'spindle'?: (_linuxcnc_v1_SpindleStat)[];
  'digitalInput'?: (number)[];
  'digitalOutput'?: (number)[];
  'analogInput'?: (number | string)[];
  'analogOutput'?: (number | string)[];
}

export interface MotionStat__Output {
  'traj'?: (_linuxcnc_v1_TrajectoryStat__Output);
  'joint'?: (_linuxcnc_v1_JointStat__Output)[];
  'axis'?: (_linuxcnc_v1_AxisStat__Output)[];
  'spindle'?: (_linuxcnc_v1_SpindleStat__Output)[];
  'digitalInput'?: (number)[];
  'digitalOutput'?: (number)[];
  'analogInput'?: (number)[];
  'analogOutput'?: (number)[];
}
