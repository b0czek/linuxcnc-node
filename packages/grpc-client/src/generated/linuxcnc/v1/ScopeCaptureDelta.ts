// Original file: proto/linuxcnc/v1/scope.proto

import type { PackedChannel as _linuxcnc_v1_PackedChannel, PackedChannel__Output as _linuxcnc_v1_PackedChannel__Output } from '../../linuxcnc/v1/PackedChannel';
import type { Long } from '@grpc/proto-loader';

export interface ScopeCaptureDelta {
  'channels'?: (_linuxcnc_v1_PackedChannel)[];
  'samples'?: (number);
  'capacity'?: (number);
  'sequence'?: (number | string | Long);
  'samplePeriodNs'?: (number | string | Long);
  'reset'?: (boolean);
  'generation'?: (number | string | Long);
  'skippedFrames'?: (number | string | Long);
}

export interface ScopeCaptureDelta__Output {
  'channels'?: (_linuxcnc_v1_PackedChannel__Output)[];
  'samples'?: (number);
  'capacity'?: (number);
  'sequence'?: (string);
  'samplePeriodNs'?: (string);
  'reset'?: (boolean);
  'generation'?: (string);
  'skippedFrames'?: (string);
}
