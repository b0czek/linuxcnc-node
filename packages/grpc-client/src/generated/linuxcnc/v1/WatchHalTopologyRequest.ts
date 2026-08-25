// Original file: proto/linuxcnc/v1/hal.proto

import type { Long } from '@grpc/proto-loader';

export interface WatchHalTopologyRequest {
  'afterSequence'?: (number | string | Long);
}

export interface WatchHalTopologyRequest__Output {
  'afterSequence'?: (string);
}
