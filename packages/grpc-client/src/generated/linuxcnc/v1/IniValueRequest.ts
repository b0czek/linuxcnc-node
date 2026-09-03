// Original file: proto/linuxcnc/v1/ini.proto


/**
 * Selects a value from the active LinuxCNC INI. Occurrence uses the same
 * one-based numbering as linuxcnc.ini; when omitted, the first value is used.
 */
export interface IniValueRequest {
  'section'?: (string);
  'key'?: (string);
  'occurrence'?: (number);
  '_occurrence'?: "occurrence";
}

/**
 * Selects a value from the active LinuxCNC INI. Occurrence uses the same
 * one-based numbering as linuxcnc.ini; when omitted, the first value is used.
 */
export interface IniValueRequest__Output {
  'section'?: (string);
  'key'?: (string);
  'occurrence'?: (number);
  '_occurrence'?: "occurrence";
}
