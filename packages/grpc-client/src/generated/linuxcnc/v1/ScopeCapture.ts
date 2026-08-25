// Original file: proto/linuxcnc/v1/scope.proto

import type { PackedChannel as _linuxcnc_v1_PackedChannel, PackedChannel__Output as _linuxcnc_v1_PackedChannel__Output } from '../../linuxcnc/v1/PackedChannel';
import type { Long } from '@grpc/proto-loader';

export interface ScopeCapture {
  'channels'?: (_linuxcnc_v1_PackedChannel)[];
  'samples'?: (number);
  'triggerIndex'?: (number);
  'samplePeriodNs'?: (number | string | Long);
  'generation'?: (number | string | Long);
  'skippedFrames'?: (number | string | Long);
}

export interface ScopeCapture__Output {
  'channels'?: (_linuxcnc_v1_PackedChannel__Output)[];
  'samples'?: (number);
  'triggerIndex'?: (number);
  'samplePeriodNs'?: (string);
  'generation'?: (string);
  'skippedFrames'?: (string);
}
