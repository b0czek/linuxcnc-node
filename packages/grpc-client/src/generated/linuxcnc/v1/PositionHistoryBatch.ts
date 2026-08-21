// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { PositionBatchKind as _linuxcnc_v1_PositionBatchKind, PositionBatchKind__Output as _linuxcnc_v1_PositionBatchKind__Output } from '../../linuxcnc/v1/PositionBatchKind';
import type { Long } from '@grpc/proto-loader';

export interface PositionHistoryBatch {
  'kind'?: (_linuxcnc_v1_PositionBatchKind);
  'firstSequence'?: (number | string | Long);
  'nextSequence'?: (number | string | Long);
  'valuesLeF64'?: (Buffer | Uint8Array | string);
  'valueCount'?: (number);
  'stride'?: (number);
  'generation'?: (number | string | Long);
  'skippedBatches'?: (number | string | Long);
}

export interface PositionHistoryBatch__Output {
  'kind'?: (_linuxcnc_v1_PositionBatchKind__Output);
  'firstSequence'?: (string);
  'nextSequence'?: (string);
  'valuesLeF64'?: (Buffer);
  'valueCount'?: (number);
  'stride'?: (number);
  'generation'?: (string);
  'skippedBatches'?: (string);
}
