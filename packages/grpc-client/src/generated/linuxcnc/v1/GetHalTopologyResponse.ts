// Original file: proto/linuxcnc/v1/hal.proto

import type { HalTopology as _linuxcnc_v1_HalTopology, HalTopology__Output as _linuxcnc_v1_HalTopology__Output } from '../../linuxcnc/v1/HalTopology';
import type { Long } from '@grpc/proto-loader';

export interface GetHalTopologyResponse {
  'sequence'?: (number | string | Long);
  'topology'?: (_linuxcnc_v1_HalTopology | null);
}

export interface GetHalTopologyResponse__Output {
  'sequence'?: (string);
  'topology'?: (_linuxcnc_v1_HalTopology__Output);
}
