// Original file: proto/linuxcnc/v1/websocket.proto

import type { ProgramPreviewErrorCode as _linuxcnc_v1_ProgramPreviewErrorCode, ProgramPreviewErrorCode__Output as _linuxcnc_v1_ProgramPreviewErrorCode__Output } from '../../linuxcnc/v1/ProgramPreviewErrorCode';

export interface ProgramPreviewError {
  'code'?: (_linuxcnc_v1_ProgramPreviewErrorCode);
  'message'?: (string);
  'lineNumber'?: (number);
  '_lineNumber'?: "lineNumber";
}

export interface ProgramPreviewError__Output {
  'code'?: (_linuxcnc_v1_ProgramPreviewErrorCode__Output);
  'message'?: (string);
  'lineNumber'?: (number);
  '_lineNumber'?: "lineNumber";
}
