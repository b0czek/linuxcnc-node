// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { PositionHistoryConfig as _linuxcnc_v1_PositionHistoryConfig, PositionHistoryConfig__Output as _linuxcnc_v1_PositionHistoryConfig__Output } from '../../linuxcnc/v1/PositionHistoryConfig';
import type { EmptyCommand as _linuxcnc_v1_EmptyCommand, EmptyCommand__Output as _linuxcnc_v1_EmptyCommand__Output } from '../../linuxcnc/v1/EmptyCommand';
import type { PositionHistoryCursor as _linuxcnc_v1_PositionHistoryCursor, PositionHistoryCursor__Output as _linuxcnc_v1_PositionHistoryCursor__Output } from '../../linuxcnc/v1/PositionHistoryCursor';

export interface PositionHistoryRequest {
  'configure'?: (_linuxcnc_v1_PositionHistoryConfig | null);
  'clear'?: (_linuxcnc_v1_EmptyCommand | null);
  'cursor'?: (_linuxcnc_v1_PositionHistoryCursor | null);
  'request'?: "configure"|"clear"|"cursor";
}

export interface PositionHistoryRequest__Output {
  'configure'?: (_linuxcnc_v1_PositionHistoryConfig__Output);
  'clear'?: (_linuxcnc_v1_EmptyCommand__Output);
  'cursor'?: (_linuxcnc_v1_PositionHistoryCursor__Output);
  'request'?: "configure"|"clear"|"cursor";
}
