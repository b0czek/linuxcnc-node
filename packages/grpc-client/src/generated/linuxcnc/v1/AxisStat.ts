// Original file: proto/linuxcnc/v1/linuxcnc.proto


export interface AxisStat {
  'minPositionLimit'?: (number | string);
  'maxPositionLimit'?: (number | string);
  'velocity'?: (number | string);
}

export interface AxisStat__Output {
  'minPositionLimit'?: (number);
  'maxPositionLimit'?: (number);
  'velocity'?: (number);
}
