// Original file: proto/linuxcnc/v1/machine.proto

import type { RcsStatus as _linuxcnc_v1_RcsStatus, RcsStatus__Output as _linuxcnc_v1_RcsStatus__Output } from '../../linuxcnc/v1/RcsStatus';
import type { TaskStatDelta as _linuxcnc_v1_TaskStatDelta, TaskStatDelta__Output as _linuxcnc_v1_TaskStatDelta__Output } from '../../linuxcnc/v1/TaskStatDelta';
import type { MotionStatDelta as _linuxcnc_v1_MotionStatDelta, MotionStatDelta__Output as _linuxcnc_v1_MotionStatDelta__Output } from '../../linuxcnc/v1/MotionStatDelta';
import type { IoStatDelta as _linuxcnc_v1_IoStatDelta, IoStatDelta__Output as _linuxcnc_v1_IoStatDelta__Output } from '../../linuxcnc/v1/IoStatDelta';
import type { ToolTableDelta as _linuxcnc_v1_ToolTableDelta, ToolTableDelta__Output as _linuxcnc_v1_ToolTableDelta__Output } from '../../linuxcnc/v1/ToolTableDelta';
import type { Long } from '@grpc/proto-loader';

export interface LinuxCNCStatDelta {
  'sequence'?: (number | string | Long);
  /**
   * One source observation produces one atomic delta. Scalar presence is
   * explicit so valid zero-valued changes are distinguishable from absence.
   */
  'echoSerialNumber'?: (number | string | Long);
  'state'?: (_linuxcnc_v1_RcsStatus);
  'task'?: (_linuxcnc_v1_TaskStatDelta | null);
  'motion'?: (_linuxcnc_v1_MotionStatDelta | null);
  'io'?: (_linuxcnc_v1_IoStatDelta | null);
  'toolTable'?: (_linuxcnc_v1_ToolTableDelta | null);
  'debug'?: (number);
  '_echoSerialNumber'?: "echoSerialNumber";
  '_state'?: "state";
  '_debug'?: "debug";
}

export interface LinuxCNCStatDelta__Output {
  'sequence'?: (string);
  /**
   * One source observation produces one atomic delta. Scalar presence is
   * explicit so valid zero-valued changes are distinguishable from absence.
   */
  'echoSerialNumber'?: (string);
  'state'?: (_linuxcnc_v1_RcsStatus__Output);
  'task'?: (_linuxcnc_v1_TaskStatDelta__Output);
  'motion'?: (_linuxcnc_v1_MotionStatDelta__Output);
  'io'?: (_linuxcnc_v1_IoStatDelta__Output);
  'toolTable'?: (_linuxcnc_v1_ToolTableDelta__Output);
  'debug'?: (number);
  '_echoSerialNumber'?: "echoSerialNumber";
  '_state'?: "state";
  '_debug'?: "debug";
}
