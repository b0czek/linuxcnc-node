// Original file: proto/linuxcnc/v1/linuxcnc.proto


export interface FileChunk {
  'relativePath'?: (string);
  'data'?: (Buffer | Uint8Array | string);
  'eof'?: (boolean);
}

export interface FileChunk__Output {
  'relativePath'?: (string);
  'data'?: (Buffer);
  'eof'?: (boolean);
}
