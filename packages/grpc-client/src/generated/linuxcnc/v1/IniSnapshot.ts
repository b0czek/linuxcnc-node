// Original file: proto/linuxcnc/v1/ini.proto

import type { IniEntry as _linuxcnc_v1_IniEntry, IniEntry__Output as _linuxcnc_v1_IniEntry__Output } from '../../linuxcnc/v1/IniEntry';

/**
 * Parsed active INI, including resolved includes and repeated keys in order.
 */
export interface IniSnapshot {
  'entries'?: (_linuxcnc_v1_IniEntry)[];
}

/**
 * Parsed active INI, including resolved includes and repeated keys in order.
 */
export interface IniSnapshot__Output {
  'entries'?: (_linuxcnc_v1_IniEntry__Output)[];
}
