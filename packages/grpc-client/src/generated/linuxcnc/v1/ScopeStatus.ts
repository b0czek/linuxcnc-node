// Original file: proto/linuxcnc/v1/scope.proto

import type { ScopeRuntimeState as _linuxcnc_v1_ScopeRuntimeState, ScopeRuntimeState__Output as _linuxcnc_v1_ScopeRuntimeState__Output } from '../../linuxcnc/v1/ScopeRuntimeState';
import type { Long } from '@grpc/proto-loader';

export interface ScopeStatus {
  'state'?: (_linuxcnc_v1_ScopeRuntimeState);
  'bufferLength'?: (number);
  'recordLength'?: (number);
  'sampleLength'?: (number);
  'samples'?: (number);
  'start'?: (number);
  'multiplier'?: (number);
  'watchdog'?: (number);
  'threadName'?: (string);
  'samplePeriodNs'?: (number | string | Long);
  'generation'?: (number | string | Long);
  'skippedFrames'?: (number | string | Long);
}

export interface ScopeStatus__Output {
  'state'?: (_linuxcnc_v1_ScopeRuntimeState__Output);
  'bufferLength'?: (number);
  'recordLength'?: (number);
  'sampleLength'?: (number);
  'samples'?: (number);
  'start'?: (number);
  'multiplier'?: (number);
  'watchdog'?: (number);
  'threadName'?: (string);
  'samplePeriodNs'?: (string);
  'generation'?: (string);
  'skippedFrames'?: (string);
}
