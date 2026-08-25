// Original file: proto/linuxcnc/v1/machine.proto

import type { ToolEntry as _linuxcnc_v1_ToolEntry, ToolEntry__Output as _linuxcnc_v1_ToolEntry__Output } from '../../linuxcnc/v1/ToolEntry';

export interface ToolTableDelta {
  'replaced'?: (_linuxcnc_v1_ToolEntry)[];
  'removedToolNumbers'?: (number)[];
  'replaceAll'?: (boolean);
}

export interface ToolTableDelta__Output {
  'replaced'?: (_linuxcnc_v1_ToolEntry__Output)[];
  'removedToolNumbers'?: (number)[];
  'replaceAll'?: (boolean);
}
