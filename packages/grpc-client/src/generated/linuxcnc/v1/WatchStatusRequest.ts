// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { Long } from '@grpc/proto-loader';

export interface WatchStatusRequest {
  'afterSequence'?: (number | string | Long);
}

export interface WatchStatusRequest__Output {
  'afterSequence'?: (string);
}
