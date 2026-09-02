// Original file: proto/linuxcnc/v1/scope.proto

import type { ScopeChannelConfig as _linuxcnc_v1_ScopeChannelConfig, ScopeChannelConfig__Output as _linuxcnc_v1_ScopeChannelConfig__Output } from '../../linuxcnc/v1/ScopeChannelConfig';

export interface ScopeAcquisitionConfig {
  'threadName'?: (string);
  'multiplier'?: (number);
  'preTrigger'?: (number);
  'triggerChannel'?: (number);
  'triggerLevel'?: (number | string);
  'rising'?: (boolean);
  'automatic'?: (boolean);
  'channels'?: (_linuxcnc_v1_ScopeChannelConfig)[];
}

export interface ScopeAcquisitionConfig__Output {
  'threadName'?: (string);
  'multiplier'?: (number);
  'preTrigger'?: (number);
  'triggerChannel'?: (number);
  'triggerLevel'?: (number);
  'rising'?: (boolean);
  'automatic'?: (boolean);
  'channels'?: (_linuxcnc_v1_ScopeChannelConfig__Output)[];
}
