// Original file: proto/linuxcnc/v1/machine.proto

import type { RcsStatus as _linuxcnc_v1_RcsStatus, RcsStatus__Output as _linuxcnc_v1_RcsStatus__Output } from '../../linuxcnc/v1/RcsStatus';
import type { LinuxCNCError as _linuxcnc_v1_LinuxCNCError, LinuxCNCError__Output as _linuxcnc_v1_LinuxCNCError__Output } from '../../linuxcnc/v1/LinuxCNCError';
import type { Long } from '@grpc/proto-loader';

export interface ExecuteCommandResponse {
  'commandSequence'?: (number | string | Long);
  'status'?: (_linuxcnc_v1_RcsStatus);
  'error'?: (_linuxcnc_v1_LinuxCNCError | null);
}

export interface ExecuteCommandResponse__Output {
  'commandSequence'?: (string);
  'status'?: (_linuxcnc_v1_RcsStatus__Output);
  'error'?: (_linuxcnc_v1_LinuxCNCError__Output);
}
