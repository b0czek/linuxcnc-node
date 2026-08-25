// Original file: proto/linuxcnc/v1/program.proto

import type { Plane as _linuxcnc_v1_Plane, Plane__Output as _linuxcnc_v1_Plane__Output } from '../../linuxcnc/v1/Plane';

export interface ArcData {
  'plane'?: (_linuxcnc_v1_Plane);
  'centerFirst'?: (number | string);
  'centerSecond'?: (number | string);
  'rotation'?: (number | string);
  'axisEndPoint'?: (number | string);
}

export interface ArcData__Output {
  'plane'?: (_linuxcnc_v1_Plane__Output);
  'centerFirst'?: (number);
  'centerSecond'?: (number);
  'rotation'?: (number);
  'axisEndPoint'?: (number);
}
