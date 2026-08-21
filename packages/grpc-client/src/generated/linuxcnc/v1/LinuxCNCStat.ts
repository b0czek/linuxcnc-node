// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { RcsStatus as _linuxcnc_v1_RcsStatus, RcsStatus__Output as _linuxcnc_v1_RcsStatus__Output } from '../../linuxcnc/v1/RcsStatus';
import type { TaskStat as _linuxcnc_v1_TaskStat, TaskStat__Output as _linuxcnc_v1_TaskStat__Output } from '../../linuxcnc/v1/TaskStat';
import type { MotionStat as _linuxcnc_v1_MotionStat, MotionStat__Output as _linuxcnc_v1_MotionStat__Output } from '../../linuxcnc/v1/MotionStat';
import type { IoStat as _linuxcnc_v1_IoStat, IoStat__Output as _linuxcnc_v1_IoStat__Output } from '../../linuxcnc/v1/IoStat';
import type { ToolEntry as _linuxcnc_v1_ToolEntry, ToolEntry__Output as _linuxcnc_v1_ToolEntry__Output } from '../../linuxcnc/v1/ToolEntry';
import type { Long } from '@grpc/proto-loader';

export interface LinuxCNCStat {
  'echoSerialNumber'?: (number | string | Long);
  'state'?: (_linuxcnc_v1_RcsStatus);
  'task'?: (_linuxcnc_v1_TaskStat | null);
  'motion'?: (_linuxcnc_v1_MotionStat | null);
  'io'?: (_linuxcnc_v1_IoStat | null);
  'debug'?: (number);
  'toolTable'?: (_linuxcnc_v1_ToolEntry)[];
}

export interface LinuxCNCStat__Output {
  'echoSerialNumber'?: (string);
  'state'?: (_linuxcnc_v1_RcsStatus__Output);
  'task'?: (_linuxcnc_v1_TaskStat__Output);
  'motion'?: (_linuxcnc_v1_MotionStat__Output);
  'io'?: (_linuxcnc_v1_IoStat__Output);
  'debug'?: (number);
  'toolTable'?: (_linuxcnc_v1_ToolEntry__Output)[];
}
