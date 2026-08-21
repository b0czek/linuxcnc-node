// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { Long } from '@grpc/proto-loader';

export interface HalThreadInfo {
  'name'?: (string);
  'periodNs'?: (number | string | Long);
  'priority'?: (number);
  'usesFp'?: (boolean);
  'running'?: (boolean);
  'runtime'?: (number | string);
  'maxRuntime'?: (number | string);
  'functions'?: (string)[];
}

export interface HalThreadInfo__Output {
  'name'?: (string);
  'periodNs'?: (string);
  'priority'?: (number);
  'usesFp'?: (boolean);
  'running'?: (boolean);
  'runtime'?: (number);
  'maxRuntime'?: (number);
  'functions'?: (string)[];
}
