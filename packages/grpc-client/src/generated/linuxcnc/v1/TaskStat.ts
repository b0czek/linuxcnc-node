// Original file: proto/linuxcnc/v1/machine.proto

import type { TaskMode as _linuxcnc_v1_TaskMode, TaskMode__Output as _linuxcnc_v1_TaskMode__Output } from '../../linuxcnc/v1/TaskMode';
import type { TaskState as _linuxcnc_v1_TaskState, TaskState__Output as _linuxcnc_v1_TaskState__Output } from '../../linuxcnc/v1/TaskState';
import type { ExecState as _linuxcnc_v1_ExecState, ExecState__Output as _linuxcnc_v1_ExecState__Output } from '../../linuxcnc/v1/ExecState';
import type { InterpState as _linuxcnc_v1_InterpState, InterpState__Output as _linuxcnc_v1_InterpState__Output } from '../../linuxcnc/v1/InterpState';
import type { StopState as _linuxcnc_v1_StopState, StopState__Output as _linuxcnc_v1_StopState__Output } from '../../linuxcnc/v1/StopState';
import type { Position as _linuxcnc_v1_Position, Position__Output as _linuxcnc_v1_Position__Output } from '../../linuxcnc/v1/Position';
import type { ActiveGCodes as _linuxcnc_v1_ActiveGCodes, ActiveGCodes__Output as _linuxcnc_v1_ActiveGCodes__Output } from '../../linuxcnc/v1/ActiveGCodes';
import type { ActiveMCodes as _linuxcnc_v1_ActiveMCodes, ActiveMCodes__Output as _linuxcnc_v1_ActiveMCodes__Output } from '../../linuxcnc/v1/ActiveMCodes';
import type { ActiveSettings as _linuxcnc_v1_ActiveSettings, ActiveSettings__Output as _linuxcnc_v1_ActiveSettings__Output } from '../../linuxcnc/v1/ActiveSettings';
import type { ProgramUnits as _linuxcnc_v1_ProgramUnits, ProgramUnits__Output as _linuxcnc_v1_ProgramUnits__Output } from '../../linuxcnc/v1/ProgramUnits';

export interface TaskStat {
  'mode'?: (_linuxcnc_v1_TaskMode);
  'state'?: (_linuxcnc_v1_TaskState);
  'execState'?: (_linuxcnc_v1_ExecState);
  'interpState'?: (_linuxcnc_v1_InterpState);
  'stopState'?: (_linuxcnc_v1_StopState);
  'callLevel'?: (number);
  'motionLine'?: (number);
  'currentLine'?: (number);
  'readLine'?: (number);
  'optionalStopState'?: (boolean);
  'blockDeleteState'?: (boolean);
  'inputTimeout'?: (boolean);
  'file'?: (string);
  'command'?: (string);
  'iniFilename'?: (string);
  'g5xOffset'?: (_linuxcnc_v1_Position | null);
  'g5xIndex'?: (number);
  'g5xOffsets'?: (_linuxcnc_v1_Position)[];
  'g5xRotations'?: (number | string)[];
  'g92Offset'?: (_linuxcnc_v1_Position | null);
  'g28Position'?: (_linuxcnc_v1_Position | null);
  'g30Position'?: (_linuxcnc_v1_Position | null);
  'rotationXy'?: (number | string);
  'toolOffset'?: (_linuxcnc_v1_Position | null);
  'activeGCodes'?: (_linuxcnc_v1_ActiveGCodes | null);
  'activeMCodes'?: (_linuxcnc_v1_ActiveMCodes | null);
  'activeSettings'?: (_linuxcnc_v1_ActiveSettings | null);
  'programUnits'?: (_linuxcnc_v1_ProgramUnits);
  'interpreterErrorCode'?: (number);
  'taskPaused'?: (boolean);
  'delayLeft'?: (number | string);
  'queuedMdiCommands'?: (number);
}

export interface TaskStat__Output {
  'mode'?: (_linuxcnc_v1_TaskMode__Output);
  'state'?: (_linuxcnc_v1_TaskState__Output);
  'execState'?: (_linuxcnc_v1_ExecState__Output);
  'interpState'?: (_linuxcnc_v1_InterpState__Output);
  'stopState'?: (_linuxcnc_v1_StopState__Output);
  'callLevel'?: (number);
  'motionLine'?: (number);
  'currentLine'?: (number);
  'readLine'?: (number);
  'optionalStopState'?: (boolean);
  'blockDeleteState'?: (boolean);
  'inputTimeout'?: (boolean);
  'file'?: (string);
  'command'?: (string);
  'iniFilename'?: (string);
  'g5xOffset'?: (_linuxcnc_v1_Position__Output);
  'g5xIndex'?: (number);
  'g5xOffsets'?: (_linuxcnc_v1_Position__Output)[];
  'g5xRotations'?: (number)[];
  'g92Offset'?: (_linuxcnc_v1_Position__Output);
  'g28Position'?: (_linuxcnc_v1_Position__Output);
  'g30Position'?: (_linuxcnc_v1_Position__Output);
  'rotationXy'?: (number);
  'toolOffset'?: (_linuxcnc_v1_Position__Output);
  'activeGCodes'?: (_linuxcnc_v1_ActiveGCodes__Output);
  'activeMCodes'?: (_linuxcnc_v1_ActiveMCodes__Output);
  'activeSettings'?: (_linuxcnc_v1_ActiveSettings__Output);
  'programUnits'?: (_linuxcnc_v1_ProgramUnits__Output);
  'interpreterErrorCode'?: (number);
  'taskPaused'?: (boolean);
  'delayLeft'?: (number);
  'queuedMdiCommands'?: (number);
}
