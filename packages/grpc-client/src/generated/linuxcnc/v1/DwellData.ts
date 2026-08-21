// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type { Plane as _linuxcnc_v1_Plane, Plane__Output as _linuxcnc_v1_Plane__Output } from '../../linuxcnc/v1/Plane';

export interface DwellData {
  'duration'?: (number | string);
  'plane'?: (_linuxcnc_v1_Plane);
}

export interface DwellData__Output {
  'duration'?: (number);
  'plane'?: (_linuxcnc_v1_Plane__Output);
}
