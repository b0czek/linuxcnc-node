// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { JointStat as _linuxcnc_v1_JointStat, JointStat__Output as _linuxcnc_v1_JointStat__Output } from '../../linuxcnc/v1/JointStat';

/**
 * Status deltas are typed and indexed.  There is deliberately no property
 * path, JSON, Any, or generic map in this contract.
 */
export interface IndexedJointDelta {
  'index'?: (number);
  'value'?: (_linuxcnc_v1_JointStat | null);
}

/**
 * Status deltas are typed and indexed.  There is deliberately no property
 * path, JSON, Any, or generic map in this contract.
 */
export interface IndexedJointDelta__Output {
  'index'?: (number);
  'value'?: (_linuxcnc_v1_JointStat__Output);
}
