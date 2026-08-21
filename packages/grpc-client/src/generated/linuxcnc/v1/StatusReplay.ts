// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { LinuxCNCStat as _linuxcnc_v1_LinuxCNCStat, LinuxCNCStat__Output as _linuxcnc_v1_LinuxCNCStat__Output } from '../../linuxcnc/v1/LinuxCNCStat';
import type { LinuxCNCStatDelta as _linuxcnc_v1_LinuxCNCStatDelta, LinuxCNCStatDelta__Output as _linuxcnc_v1_LinuxCNCStatDelta__Output } from '../../linuxcnc/v1/LinuxCNCStatDelta';
import type { Long } from '@grpc/proto-loader';

export interface StatusReplay {
  'fromSequence'?: (number | string | Long);
  'toSequence'?: (number | string | Long);
  'snapshot'?: (_linuxcnc_v1_LinuxCNCStat | null);
  'deltas'?: (_linuxcnc_v1_LinuxCNCStatDelta)[];
}

export interface StatusReplay__Output {
  'fromSequence'?: (string);
  'toSequence'?: (string);
  'snapshot'?: (_linuxcnc_v1_LinuxCNCStat__Output);
  'deltas'?: (_linuxcnc_v1_LinuxCNCStatDelta__Output)[];
}
