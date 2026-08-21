// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { ScopeAcquire as _linuxcnc_v1_ScopeAcquire, ScopeAcquire__Output as _linuxcnc_v1_ScopeAcquire__Output } from '../../linuxcnc/v1/ScopeAcquire';
import type { ScopeConfigure as _linuxcnc_v1_ScopeConfigure, ScopeConfigure__Output as _linuxcnc_v1_ScopeConfigure__Output } from '../../linuxcnc/v1/ScopeConfigure';
import type { ScopeRun as _linuxcnc_v1_ScopeRun, ScopeRun__Output as _linuxcnc_v1_ScopeRun__Output } from '../../linuxcnc/v1/ScopeRun';
import type { ScopeStop as _linuxcnc_v1_ScopeStop, ScopeStop__Output as _linuxcnc_v1_ScopeStop__Output } from '../../linuxcnc/v1/ScopeStop';
import type { ScopeTrigger as _linuxcnc_v1_ScopeTrigger, ScopeTrigger__Output as _linuxcnc_v1_ScopeTrigger__Output } from '../../linuxcnc/v1/ScopeTrigger';
import type { ScopeFrameAck as _linuxcnc_v1_ScopeFrameAck, ScopeFrameAck__Output as _linuxcnc_v1_ScopeFrameAck__Output } from '../../linuxcnc/v1/ScopeFrameAck';
import type { ScopeStatus as _linuxcnc_v1_ScopeStatus, ScopeStatus__Output as _linuxcnc_v1_ScopeStatus__Output } from '../../linuxcnc/v1/ScopeStatus';
import type { ScopeCapture as _linuxcnc_v1_ScopeCapture, ScopeCapture__Output as _linuxcnc_v1_ScopeCapture__Output } from '../../linuxcnc/v1/ScopeCapture';
import type { ScopeCaptureDelta as _linuxcnc_v1_ScopeCaptureDelta, ScopeCaptureDelta__Output as _linuxcnc_v1_ScopeCaptureDelta__Output } from '../../linuxcnc/v1/ScopeCaptureDelta';

export interface ScopeSessionMessage {
  'acquire'?: (_linuxcnc_v1_ScopeAcquire | null);
  'configure'?: (_linuxcnc_v1_ScopeConfigure | null);
  'run'?: (_linuxcnc_v1_ScopeRun | null);
  'stop'?: (_linuxcnc_v1_ScopeStop | null);
  'trigger'?: (_linuxcnc_v1_ScopeTrigger | null);
  'ack'?: (_linuxcnc_v1_ScopeFrameAck | null);
  'status'?: (_linuxcnc_v1_ScopeStatus | null);
  'capture'?: (_linuxcnc_v1_ScopeCapture | null);
  'roll'?: (_linuxcnc_v1_ScopeCaptureDelta | null);
  'message'?: "acquire"|"configure"|"run"|"stop"|"trigger"|"ack"|"status"|"capture"|"roll";
}

export interface ScopeSessionMessage__Output {
  'acquire'?: (_linuxcnc_v1_ScopeAcquire__Output);
  'configure'?: (_linuxcnc_v1_ScopeConfigure__Output);
  'run'?: (_linuxcnc_v1_ScopeRun__Output);
  'stop'?: (_linuxcnc_v1_ScopeStop__Output);
  'trigger'?: (_linuxcnc_v1_ScopeTrigger__Output);
  'ack'?: (_linuxcnc_v1_ScopeFrameAck__Output);
  'status'?: (_linuxcnc_v1_ScopeStatus__Output);
  'capture'?: (_linuxcnc_v1_ScopeCapture__Output);
  'roll'?: (_linuxcnc_v1_ScopeCaptureDelta__Output);
  'message'?: "acquire"|"configure"|"run"|"stop"|"trigger"|"ack"|"status"|"capture"|"roll";
}
