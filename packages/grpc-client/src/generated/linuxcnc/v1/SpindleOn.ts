// Original file: proto/linuxcnc/v1/linuxcnc.proto


export interface SpindleOn {
  'speed'?: (number | string);
  'spindleIndex'?: (number);
  'waitForSpeed'?: (boolean);
  'hasSpindleIndex'?: (boolean);
}

export interface SpindleOn__Output {
  'speed'?: (number);
  'spindleIndex'?: (number);
  'waitForSpeed'?: (boolean);
  'hasSpindleIndex'?: (boolean);
}
