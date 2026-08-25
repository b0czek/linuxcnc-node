// Original file: proto/linuxcnc/v1/websocket.proto

import type { ParseProgress as _linuxcnc_v1_ParseProgress, ParseProgress__Output as _linuxcnc_v1_ParseProgress__Output } from '../../linuxcnc/v1/ParseProgress';
import type { ParseBatch as _linuxcnc_v1_ParseBatch, ParseBatch__Output as _linuxcnc_v1_ParseBatch__Output } from '../../linuxcnc/v1/ParseBatch';
import type { ParseSummary as _linuxcnc_v1_ParseSummary, ParseSummary__Output as _linuxcnc_v1_ParseSummary__Output } from '../../linuxcnc/v1/ParseSummary';
import type { ProgramPreviewError as _linuxcnc_v1_ProgramPreviewError, ProgramPreviewError__Output as _linuxcnc_v1_ProgramPreviewError__Output } from '../../linuxcnc/v1/ProgramPreviewError';

export interface ProgramPreviewEvent {
  'progress'?: (_linuxcnc_v1_ParseProgress | null);
  'batch'?: (_linuxcnc_v1_ParseBatch | null);
  'summary'?: (_linuxcnc_v1_ParseSummary | null);
  'error'?: (_linuxcnc_v1_ProgramPreviewError | null);
  'event'?: "progress"|"batch"|"summary"|"error";
}

export interface ProgramPreviewEvent__Output {
  'progress'?: (_linuxcnc_v1_ParseProgress__Output);
  'batch'?: (_linuxcnc_v1_ParseBatch__Output);
  'summary'?: (_linuxcnc_v1_ParseSummary__Output);
  'error'?: (_linuxcnc_v1_ProgramPreviewError__Output);
  'event'?: "progress"|"batch"|"summary"|"error";
}
