// Original file: proto/linuxcnc/v1/websocket.proto

export const ProgramPreviewErrorCode = {
  PROGRAM_PREVIEW_ERROR_CODE_UNSPECIFIED: 0,
  PROGRAM_PREVIEW_ERROR_CODE_INVALID_ENTRY: 1,
  PROGRAM_PREVIEW_ERROR_CODE_INTERPRETER: 2,
  PROGRAM_PREVIEW_ERROR_CODE_INTERNAL: 3,
} as const;

export type ProgramPreviewErrorCode =
  | 'PROGRAM_PREVIEW_ERROR_CODE_UNSPECIFIED'
  | 0
  | 'PROGRAM_PREVIEW_ERROR_CODE_INVALID_ENTRY'
  | 1
  | 'PROGRAM_PREVIEW_ERROR_CODE_INTERPRETER'
  | 2
  | 'PROGRAM_PREVIEW_ERROR_CODE_INTERNAL'
  | 3

export type ProgramPreviewErrorCode__Output = typeof ProgramPreviewErrorCode[keyof typeof ProgramPreviewErrorCode]
