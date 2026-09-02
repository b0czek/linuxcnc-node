// Original file: proto/linuxcnc/v1/program.proto

import type { Long } from '@grpc/proto-loader';

export interface UploadWorkspaceResponse {
  'workspaceId'?: (string);
  'expiresAtUnixMs'?: (number | string | Long);
  'archiveBytes'?: (number | string | Long);
  'extractedBytes'?: (number | string | Long);
  'entries'?: (number | string | Long);
}

export interface UploadWorkspaceResponse__Output {
  'workspaceId'?: (string);
  'expiresAtUnixMs'?: (string);
  'archiveBytes'?: (string);
  'extractedBytes'?: (string);
  'entries'?: (string);
}
