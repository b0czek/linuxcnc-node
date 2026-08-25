// Original file: proto/linuxcnc/v1/program.proto

import type { Plane as _linuxcnc_v1_Plane, Plane__Output as _linuxcnc_v1_Plane__Output } from '../../linuxcnc/v1/Plane';
import type { ControlPointG5 as _linuxcnc_v1_ControlPointG5, ControlPointG5__Output as _linuxcnc_v1_ControlPointG5__Output } from '../../linuxcnc/v1/ControlPointG5';

export interface NurbsG5Data {
  'plane'?: (_linuxcnc_v1_Plane);
  'order'?: (number);
  'controlPoints'?: (_linuxcnc_v1_ControlPointG5)[];
}

export interface NurbsG5Data__Output {
  'plane'?: (_linuxcnc_v1_Plane__Output);
  'order'?: (number);
  'controlPoints'?: (_linuxcnc_v1_ControlPointG5__Output)[];
}
