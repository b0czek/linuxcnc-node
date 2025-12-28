// src/ts/enums.ts
export enum HalType {
  BIT = 1,
  FLOAT = 2,
  S32 = 3,
  U32 = 4,
  // PORT = 5, // Skipping PORT for now
}

export enum HalPinDir {
  IN = 16,
  OUT = 32,
  IO = 16 | 32, // 48
  DIR_UNSPECIFIED = -1,
}

export enum HalParamDir {
  RO = 64,
  RW = 64 | 128, // 192
}

export enum RtapiMsgLevel {
  NONE = 0,
  ERR = 1,
  WARN = 2,
  INFO = 3,
  DBG = 4,
  ALL = 5,
}
