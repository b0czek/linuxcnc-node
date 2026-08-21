// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { Long } from '@grpc/proto-loader';

export interface PositionHistoryCursor {
  'afterSequence'?: (number | string | Long);
  'afterGeneration'?: (number | string | Long);
}

export interface PositionHistoryCursor__Output {
  'afterSequence'?: (string);
  'afterGeneration'?: (string);
}
