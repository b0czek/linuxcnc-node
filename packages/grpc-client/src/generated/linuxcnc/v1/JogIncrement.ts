// Original file: proto/linuxcnc/v1/machine.proto


export interface JogIncrement {
  'axisOrJointIndex'?: (number);
  'isJointJog'?: (boolean);
  'speed'?: (number | string);
  'increment'?: (number | string);
}

export interface JogIncrement__Output {
  'axisOrJointIndex'?: (number);
  'isJointJog'?: (boolean);
  'speed'?: (number);
  'increment'?: (number);
}
