// Original file: proto/linuxcnc/v1/hal.proto

import type { HalType as _linuxcnc_v1_HalType, HalType__Output as _linuxcnc_v1_HalType__Output } from '../../linuxcnc/v1/HalType';
import type { Long } from '@grpc/proto-loader';

export interface HalScalar {
  'type'?: (_linuxcnc_v1_HalType);
  'bit'?: (boolean);
  'floatValue'?: (number | string);
  's32'?: (number);
  'u32'?: (number);
  's64'?: (number | string | Long);
  'u64'?: (number | string | Long);
  'value'?: "bit"|"floatValue"|"s32"|"u32"|"s64"|"u64";
}

export interface HalScalar__Output {
  'type'?: (_linuxcnc_v1_HalType__Output);
  'bit'?: (boolean);
  'floatValue'?: (number);
  's32'?: (number);
  'u32'?: (number);
  's64'?: (string);
  'u64'?: (string);
  'value'?: "bit"|"floatValue"|"s32"|"u32"|"s64"|"u64";
}
