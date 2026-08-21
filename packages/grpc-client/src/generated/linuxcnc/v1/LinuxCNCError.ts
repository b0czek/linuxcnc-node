// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { NmlMessageType as _linuxcnc_v1_NmlMessageType, NmlMessageType__Output as _linuxcnc_v1_NmlMessageType__Output } from '../../linuxcnc/v1/NmlMessageType';
import type { Long } from '@grpc/proto-loader';

export interface LinuxCNCError {
  'type'?: (_linuxcnc_v1_NmlMessageType);
  'message'?: (string);
  'sequence'?: (number | string | Long);
}

export interface LinuxCNCError__Output {
  'type'?: (_linuxcnc_v1_NmlMessageType__Output);
  'message'?: (string);
  'sequence'?: (string);
}
