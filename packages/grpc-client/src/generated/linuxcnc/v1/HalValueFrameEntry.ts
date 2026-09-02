// Original file: proto/linuxcnc/v1/websocket.proto

import type { HalScalar as _linuxcnc_v1_HalScalar, HalScalar__Output as _linuxcnc_v1_HalScalar__Output } from '../../linuxcnc/v1/HalScalar';

export interface HalValueFrameEntry {
  'slot'?: (number);
  /**
   * Omitted when the slot is temporarily unavailable.
   */
  'value'?: (_linuxcnc_v1_HalScalar | null);
}

export interface HalValueFrameEntry__Output {
  'slot'?: (number);
  /**
   * Omitted when the slot is temporarily unavailable.
   */
  'value'?: (_linuxcnc_v1_HalScalar__Output);
}
