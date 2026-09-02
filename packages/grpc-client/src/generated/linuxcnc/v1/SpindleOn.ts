// Original file: proto/linuxcnc/v1/machine.proto


export interface SpindleOn {
  'speed'?: (number | string);
  'spindleIndex'?: (number);
  'waitForSpeed'?: (boolean);
  '_waitForSpeed'?: "waitForSpeed";
}

export interface SpindleOn__Output {
  'speed'?: (number);
  'spindleIndex'?: (number);
  'waitForSpeed'?: (boolean);
  '_waitForSpeed'?: "waitForSpeed";
}
