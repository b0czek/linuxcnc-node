// Original file: proto/linuxcnc/v1/linuxcnc.proto


export interface SetSpindleOverride {
  'scale'?: (number | string);
  'spindleIndex'?: (number);
  'hasSpindleIndex'?: (boolean);
}

export interface SetSpindleOverride__Output {
  'scale'?: (number);
  'spindleIndex'?: (number);
  'hasSpindleIndex'?: (boolean);
}
