// Original file: proto/linuxcnc/v1/hal.proto


export interface HalFunctionInfo {
  'name'?: (string);
  'ownerId'?: (number);
  'ownerName'?: (string);
  'usesFp'?: (boolean);
  'reentrant'?: (boolean);
  'users'?: (number);
  'runtime'?: (number | string);
  'maxRuntime'?: (number | string);
  'maxRuntimeIncreased'?: (boolean);
}

export interface HalFunctionInfo__Output {
  'name'?: (string);
  'ownerId'?: (number);
  'ownerName'?: (string);
  'usesFp'?: (boolean);
  'reentrant'?: (boolean);
  'users'?: (number);
  'runtime'?: (number);
  'maxRuntime'?: (number);
  'maxRuntimeIncreased'?: (boolean);
}
