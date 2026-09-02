// Original file: proto/linuxcnc/v1/machine.proto

import type { AxisName as _linuxcnc_v1_AxisName, AxisName__Output as _linuxcnc_v1_AxisName__Output } from '../../linuxcnc/v1/AxisName';
import type { TrajMode as _linuxcnc_v1_TrajMode, TrajMode__Output as _linuxcnc_v1_TrajMode__Output } from '../../linuxcnc/v1/TrajMode';
import type { Position as _linuxcnc_v1_Position, Position__Output as _linuxcnc_v1_Position__Output } from '../../linuxcnc/v1/Position';
import type { KinematicsType as _linuxcnc_v1_KinematicsType, KinematicsType__Output as _linuxcnc_v1_KinematicsType__Output } from '../../linuxcnc/v1/KinematicsType';
import type { MotionType as _linuxcnc_v1_MotionType, MotionType__Output as _linuxcnc_v1_MotionType__Output } from '../../linuxcnc/v1/MotionType';

export interface TrajectoryStat {
  'linearUnits'?: (number | string);
  'angularUnits'?: (number | string);
  'cycleTime'?: (number | string);
  'joints'?: (number);
  'spindles'?: (number);
  'availableAxes'?: (_linuxcnc_v1_AxisName)[];
  'mode'?: (_linuxcnc_v1_TrajMode);
  'enabled'?: (boolean);
  'inPosition'?: (boolean);
  'queue'?: (number);
  'activeQueue'?: (number);
  'queueFull'?: (boolean);
  'id'?: (number);
  'paused'?: (boolean);
  'singleStepping'?: (boolean);
  'feedRateOverride'?: (number | string);
  'rapidRateOverride'?: (number | string);
  'position'?: (_linuxcnc_v1_Position | null);
  'actualPosition'?: (_linuxcnc_v1_Position | null);
  'acceleration'?: (number | string);
  'maxVelocity'?: (number | string);
  'maxAcceleration'?: (number | string);
  'probedPosition'?: (_linuxcnc_v1_Position | null);
  'probeTripped'?: (boolean);
  'probing'?: (boolean);
  'probeVal'?: (number | string);
  'kinematicsType'?: (_linuxcnc_v1_KinematicsType);
  'motionType'?: (_linuxcnc_v1_MotionType);
  'distanceToGo'?: (number | string);
  'dtg'?: (_linuxcnc_v1_Position | null);
  'currentVelocity'?: (number | string);
  'feedOverrideEnabled'?: (boolean);
  'adaptiveFeedEnabled'?: (boolean);
  'feedHoldEnabled'?: (boolean);
}

export interface TrajectoryStat__Output {
  'linearUnits'?: (number);
  'angularUnits'?: (number);
  'cycleTime'?: (number);
  'joints'?: (number);
  'spindles'?: (number);
  'availableAxes'?: (_linuxcnc_v1_AxisName__Output)[];
  'mode'?: (_linuxcnc_v1_TrajMode__Output);
  'enabled'?: (boolean);
  'inPosition'?: (boolean);
  'queue'?: (number);
  'activeQueue'?: (number);
  'queueFull'?: (boolean);
  'id'?: (number);
  'paused'?: (boolean);
  'singleStepping'?: (boolean);
  'feedRateOverride'?: (number);
  'rapidRateOverride'?: (number);
  'position'?: (_linuxcnc_v1_Position__Output);
  'actualPosition'?: (_linuxcnc_v1_Position__Output);
  'acceleration'?: (number);
  'maxVelocity'?: (number);
  'maxAcceleration'?: (number);
  'probedPosition'?: (_linuxcnc_v1_Position__Output);
  'probeTripped'?: (boolean);
  'probing'?: (boolean);
  'probeVal'?: (number);
  'kinematicsType'?: (_linuxcnc_v1_KinematicsType__Output);
  'motionType'?: (_linuxcnc_v1_MotionType__Output);
  'distanceToGo'?: (number);
  'dtg'?: (_linuxcnc_v1_Position__Output);
  'currentVelocity'?: (number);
  'feedOverrideEnabled'?: (boolean);
  'adaptiveFeedEnabled'?: (boolean);
  'feedHoldEnabled'?: (boolean);
}
