// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { LinuxCNCStat as _linuxcnc_v1_LinuxCNCStat, LinuxCNCStat__Output as _linuxcnc_v1_LinuxCNCStat__Output } from '../../linuxcnc/v1/LinuxCNCStat';
import type { Long } from '@grpc/proto-loader';

export interface GetStatusResponse {
  'sequence'?: (number | string | Long);
  'status'?: (_linuxcnc_v1_LinuxCNCStat | null);
}

export interface GetStatusResponse__Output {
  'sequence'?: (string);
  'status'?: (_linuxcnc_v1_LinuxCNCStat__Output);
}
