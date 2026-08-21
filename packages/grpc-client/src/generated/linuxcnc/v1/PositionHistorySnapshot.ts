// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { Long } from '@grpc/proto-loader';

export interface PositionHistorySnapshot {
  'firstSequence'?: (number | string | Long);
  'nextSequence'?: (number | string | Long);
  /**
   * IEEE-754 binary64 values in little-endian order.  Keeping this as bytes
   * makes the Float64Array boundary explicit and independent of protobuf's
   * scalar representation.
   */
  'valuesLeF64'?: (Buffer | Uint8Array | string);
  'valueCount'?: (number);
  'stride'?: (number);
  'generation'?: (number | string | Long);
}

export interface PositionHistorySnapshot__Output {
  'firstSequence'?: (string);
  'nextSequence'?: (string);
  /**
   * IEEE-754 binary64 values in little-endian order.  Keeping this as bytes
   * makes the Float64Array boundary explicit and independent of protobuf's
   * scalar representation.
   */
  'valuesLeF64'?: (Buffer);
  'valueCount'?: (number);
  'stride'?: (number);
  'generation'?: (string);
}
