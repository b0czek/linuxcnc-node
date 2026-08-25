// Original file: proto/linuxcnc/v1/program.proto

import type { FileChunk as _linuxcnc_v1_FileChunk, FileChunk__Output as _linuxcnc_v1_FileChunk__Output } from '../../linuxcnc/v1/FileChunk';

export interface UploadWorkspaceRequest {
  'workspaceId'?: (string);
  'file'?: (_linuxcnc_v1_FileChunk | null);
  'finish'?: (boolean);
  'content'?: "file"|"finish";
}

export interface UploadWorkspaceRequest__Output {
  'workspaceId'?: (string);
  'file'?: (_linuxcnc_v1_FileChunk__Output);
  'finish'?: (boolean);
  'content'?: "file"|"finish";
}
