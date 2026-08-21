// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { ComponentValue as _linuxcnc_v1_ComponentValue, ComponentValue__Output as _linuxcnc_v1_ComponentValue__Output } from '../../linuxcnc/v1/ComponentValue';
import type { Long } from '@grpc/proto-loader';

export interface ComponentDelta {
  'values'?: (_linuxcnc_v1_ComponentValue)[];
  'sequence'?: (number | string | Long);
}

export interface ComponentDelta__Output {
  'values'?: (_linuxcnc_v1_ComponentValue__Output)[];
  'sequence'?: (string);
}
