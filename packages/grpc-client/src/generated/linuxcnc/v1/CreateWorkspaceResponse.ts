// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { Long } from '@grpc/proto-loader';

export interface CreateWorkspaceResponse {
  'workspaceId'?: (string);
  'expiresAtUnixMs'?: (number | string | Long);
}

export interface CreateWorkspaceResponse__Output {
  'workspaceId'?: (string);
  'expiresAtUnixMs'?: (string);
}
