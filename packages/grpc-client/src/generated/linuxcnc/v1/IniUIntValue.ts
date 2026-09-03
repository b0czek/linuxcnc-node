// Original file: proto/linuxcnc/v1/ini.proto

import type { Long } from '@grpc/proto-loader';

export interface IniUIntValue {
  'value'?: (number | string | Long);
}

export interface IniUIntValue__Output {
  'value'?: (string);
}
