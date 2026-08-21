// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { Long } from '@grpc/proto-loader';

export interface CreateWorkspaceRequest {
  'ttlSeconds'?: (number | string | Long);
}

export interface CreateWorkspaceRequest__Output {
  'ttlSeconds'?: (string);
}
