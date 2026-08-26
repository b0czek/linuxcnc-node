// Original file: proto/linuxcnc/v1/machine.proto

import type { Long } from '@grpc/proto-loader';

/**
 * Replays retained errors strictly after the supplied sequence.
 */
export interface WatchErrorsRequest {
  'afterSequence'?: (number | string | Long);
}

/**
 * Replays retained errors strictly after the supplied sequence.
 */
export interface WatchErrorsRequest__Output {
  'afterSequence'?: (string);
}
