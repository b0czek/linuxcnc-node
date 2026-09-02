// Original file: proto/linuxcnc/v1/machine.proto


export interface JogContinuous {
  'axisOrJointIndex'?: (number);
  'isJointJog'?: (boolean);
  'speed'?: (number | string);
}

export interface JogContinuous__Output {
  'axisOrJointIndex'?: (number);
  'isJointJog'?: (boolean);
  'speed'?: (number);
}
