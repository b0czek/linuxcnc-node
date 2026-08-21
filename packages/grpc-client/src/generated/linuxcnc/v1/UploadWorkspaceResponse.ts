// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { Long } from '@grpc/proto-loader';

export interface UploadWorkspaceResponse {
  'bytesWritten'?: (number | string | Long);
  'files'?: (string)[];
}

export interface UploadWorkspaceResponse__Output {
  'bytesWritten'?: (string);
  'files'?: (string)[];
}
