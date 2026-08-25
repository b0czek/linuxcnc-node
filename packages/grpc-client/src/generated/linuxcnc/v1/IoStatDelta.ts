// Original file: proto/linuxcnc/v1/machine.proto

import type { ToolIoStat as _linuxcnc_v1_ToolIoStat, ToolIoStat__Output as _linuxcnc_v1_ToolIoStat__Output } from '../../linuxcnc/v1/ToolIoStat';
import type { CoolantIoStat as _linuxcnc_v1_CoolantIoStat, CoolantIoStat__Output as _linuxcnc_v1_CoolantIoStat__Output } from '../../linuxcnc/v1/CoolantIoStat';

export interface IoStatDelta {
  'tool'?: (_linuxcnc_v1_ToolIoStat | null);
  'coolant'?: (_linuxcnc_v1_CoolantIoStat | null);
  'estop'?: (boolean);
  '_estop'?: "estop";
}

export interface IoStatDelta__Output {
  'tool'?: (_linuxcnc_v1_ToolIoStat__Output);
  'coolant'?: (_linuxcnc_v1_CoolantIoStat__Output);
  'estop'?: (boolean);
  '_estop'?: "estop";
}
