// Original file: proto/linuxcnc/v1/linuxcnc.proto


export interface PackedChannel {
  /**
   * Original field 1 remains the sample payload for wire compatibility.
   */
  'values'?: (number | string)[];
  /**
   * Stable slot identity preserves null/disabled channel positions.
   */
  'index'?: (number);
  'enabled'?: (boolean);
}

export interface PackedChannel__Output {
  /**
   * Original field 1 remains the sample payload for wire compatibility.
   */
  'values'?: (number)[];
  /**
   * Stable slot identity preserves null/disabled channel positions.
   */
  'index'?: (number);
  'enabled'?: (boolean);
}
