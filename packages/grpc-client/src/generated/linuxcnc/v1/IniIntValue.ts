// Original file: proto/linuxcnc/v1/ini.proto

import type { Long } from '@grpc/proto-loader';

export interface IniIntValue {
  'value'?: (number | string | Long);
}

export interface IniIntValue__Output {
  'value'?: (string);
}
