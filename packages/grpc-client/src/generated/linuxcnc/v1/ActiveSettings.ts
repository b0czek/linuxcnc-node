// Original file: proto/linuxcnc/v1/machine.proto


export interface ActiveSettings {
  'feedRate'?: (number | string);
  'speed'?: (number | string);
  'blendTolerance'?: (number | string);
  'naiveCamTolerance'?: (number | string);
}

export interface ActiveSettings__Output {
  'feedRate'?: (number);
  'speed'?: (number);
  'blendTolerance'?: (number);
  'naiveCamTolerance'?: (number);
}
