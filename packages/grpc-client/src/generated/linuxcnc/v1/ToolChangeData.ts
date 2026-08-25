// Original file: proto/linuxcnc/v1/program.proto

import type { ToolEntry as _linuxcnc_v1_ToolEntry, ToolEntry__Output as _linuxcnc_v1_ToolEntry__Output } from '../../linuxcnc/v1/ToolEntry';

export interface ToolChangeData {
  'toolNumber'?: (number);
  'tool'?: (_linuxcnc_v1_ToolEntry | null);
}

export interface ToolChangeData__Output {
  'toolNumber'?: (number);
  'tool'?: (_linuxcnc_v1_ToolEntry__Output);
}
