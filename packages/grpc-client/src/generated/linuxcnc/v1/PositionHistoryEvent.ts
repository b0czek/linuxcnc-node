// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { PositionHistorySnapshot as _linuxcnc_v1_PositionHistorySnapshot, PositionHistorySnapshot__Output as _linuxcnc_v1_PositionHistorySnapshot__Output } from '../../linuxcnc/v1/PositionHistorySnapshot';
import type { PositionHistoryBatch as _linuxcnc_v1_PositionHistoryBatch, PositionHistoryBatch__Output as _linuxcnc_v1_PositionHistoryBatch__Output } from '../../linuxcnc/v1/PositionHistoryBatch';

export interface PositionHistoryEvent {
  'snapshot'?: (_linuxcnc_v1_PositionHistorySnapshot | null);
  'batch'?: (_linuxcnc_v1_PositionHistoryBatch | null);
  'event'?: "snapshot"|"batch";
}

export interface PositionHistoryEvent__Output {
  'snapshot'?: (_linuxcnc_v1_PositionHistorySnapshot__Output);
  'batch'?: (_linuxcnc_v1_PositionHistoryBatch__Output);
  'event'?: "snapshot"|"batch";
}
