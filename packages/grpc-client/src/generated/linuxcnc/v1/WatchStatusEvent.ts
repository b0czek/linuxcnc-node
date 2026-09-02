// Original file: proto/linuxcnc/v1/machine.proto

import type { LinuxCNCStat as _linuxcnc_v1_LinuxCNCStat, LinuxCNCStat__Output as _linuxcnc_v1_LinuxCNCStat__Output } from '../../linuxcnc/v1/LinuxCNCStat';
import type { StatusReplay as _linuxcnc_v1_StatusReplay, StatusReplay__Output as _linuxcnc_v1_StatusReplay__Output } from '../../linuxcnc/v1/StatusReplay';
import type { LinuxCNCStatDelta as _linuxcnc_v1_LinuxCNCStatDelta, LinuxCNCStatDelta__Output as _linuxcnc_v1_LinuxCNCStatDelta__Output } from '../../linuxcnc/v1/LinuxCNCStatDelta';
import type { Long } from '@grpc/proto-loader';

export interface WatchStatusEvent {
  'sequence'?: (number | string | Long);
  'snapshot'?: (_linuxcnc_v1_LinuxCNCStat | null);
  'replay'?: (_linuxcnc_v1_StatusReplay | null);
  'delta'?: (_linuxcnc_v1_LinuxCNCStatDelta | null);
  'event'?: "snapshot"|"replay"|"delta";
}

export interface WatchStatusEvent__Output {
  'sequence'?: (string);
  'snapshot'?: (_linuxcnc_v1_LinuxCNCStat__Output);
  'replay'?: (_linuxcnc_v1_StatusReplay__Output);
  'delta'?: (_linuxcnc_v1_LinuxCNCStatDelta__Output);
  'event'?: "snapshot"|"replay"|"delta";
}
