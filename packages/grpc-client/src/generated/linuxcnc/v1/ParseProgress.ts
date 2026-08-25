// Original file: proto/linuxcnc/v1/program.proto

import type { Long } from '@grpc/proto-loader';

export interface ParseProgress {
  'bytesRead'?: (number | string | Long);
  'totalBytes'?: (number | string | Long);
  'percent'?: (number);
  'operationCount'?: (number | string | Long);
}

export interface ParseProgress__Output {
  'bytesRead'?: (string);
  'totalBytes'?: (string);
  'percent'?: (number);
  'operationCount'?: (string);
}
