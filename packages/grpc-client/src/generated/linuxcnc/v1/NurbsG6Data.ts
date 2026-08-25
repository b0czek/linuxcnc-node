// Original file: proto/linuxcnc/v1/program.proto

import type { Plane as _linuxcnc_v1_Plane, Plane__Output as _linuxcnc_v1_Plane__Output } from '../../linuxcnc/v1/Plane';
import type { ControlPointG6 as _linuxcnc_v1_ControlPointG6, ControlPointG6__Output as _linuxcnc_v1_ControlPointG6__Output } from '../../linuxcnc/v1/ControlPointG6';

export interface NurbsG6Data {
  'plane'?: (_linuxcnc_v1_Plane);
  'order'?: (number);
  'controlPoints'?: (_linuxcnc_v1_ControlPointG6)[];
}

export interface NurbsG6Data__Output {
  'plane'?: (_linuxcnc_v1_Plane__Output);
  'order'?: (number);
  'controlPoints'?: (_linuxcnc_v1_ControlPointG6__Output)[];
}
