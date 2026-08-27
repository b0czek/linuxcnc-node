// Original file: proto/linuxcnc/v1/program.proto

import type { OperationType as _linuxcnc_v1_OperationType, OperationType__Output as _linuxcnc_v1_OperationType__Output } from '../../linuxcnc/v1/OperationType';
import type { Position as _linuxcnc_v1_Position, Position__Output as _linuxcnc_v1_Position__Output } from '../../linuxcnc/v1/Position';
import type { ArcData as _linuxcnc_v1_ArcData, ArcData__Output as _linuxcnc_v1_ArcData__Output } from '../../linuxcnc/v1/ArcData';
import type { ProbeData as _linuxcnc_v1_ProbeData, ProbeData__Output as _linuxcnc_v1_ProbeData__Output } from '../../linuxcnc/v1/ProbeData';
import type { RigidTapData as _linuxcnc_v1_RigidTapData, RigidTapData__Output as _linuxcnc_v1_RigidTapData__Output } from '../../linuxcnc/v1/RigidTapData';
import type { DwellData as _linuxcnc_v1_DwellData, DwellData__Output as _linuxcnc_v1_DwellData__Output } from '../../linuxcnc/v1/DwellData';
import type { NurbsG5Data as _linuxcnc_v1_NurbsG5Data, NurbsG5Data__Output as _linuxcnc_v1_NurbsG5Data__Output } from '../../linuxcnc/v1/NurbsG5Data';
import type { NurbsG6Data as _linuxcnc_v1_NurbsG6Data, NurbsG6Data__Output as _linuxcnc_v1_NurbsG6Data__Output } from '../../linuxcnc/v1/NurbsG6Data';
import type { UnitsChangeData as _linuxcnc_v1_UnitsChangeData, UnitsChangeData__Output as _linuxcnc_v1_UnitsChangeData__Output } from '../../linuxcnc/v1/UnitsChangeData';
import type { PlaneChangeData as _linuxcnc_v1_PlaneChangeData, PlaneChangeData__Output as _linuxcnc_v1_PlaneChangeData__Output } from '../../linuxcnc/v1/PlaneChangeData';
import type { G5xOffsetData as _linuxcnc_v1_G5xOffsetData, G5xOffsetData__Output as _linuxcnc_v1_G5xOffsetData__Output } from '../../linuxcnc/v1/G5xOffsetData';
import type { OffsetData as _linuxcnc_v1_OffsetData, OffsetData__Output as _linuxcnc_v1_OffsetData__Output } from '../../linuxcnc/v1/OffsetData';
import type { RotationData as _linuxcnc_v1_RotationData, RotationData__Output as _linuxcnc_v1_RotationData__Output } from '../../linuxcnc/v1/RotationData';
import type { ToolChangeData as _linuxcnc_v1_ToolChangeData, ToolChangeData__Output as _linuxcnc_v1_ToolChangeData__Output } from '../../linuxcnc/v1/ToolChangeData';
import type { FeedRateData as _linuxcnc_v1_FeedRateData, FeedRateData__Output as _linuxcnc_v1_FeedRateData__Output } from '../../linuxcnc/v1/FeedRateData';
import type { CutterCompensationData as _linuxcnc_v1_CutterCompensationData, CutterCompensationData__Output as _linuxcnc_v1_CutterCompensationData__Output } from '../../linuxcnc/v1/CutterCompensationData';

export interface GCodeOperation {
  'type'?: (_linuxcnc_v1_OperationType);
  'lineNumber'?: (number);
  'pos'?: (_linuxcnc_v1_Position | null);
  'arc'?: (_linuxcnc_v1_ArcData | null);
  'probe'?: (_linuxcnc_v1_ProbeData | null);
  'rigidTap'?: (_linuxcnc_v1_RigidTapData | null);
  'dwell'?: (_linuxcnc_v1_DwellData | null);
  'nurbsG5'?: (_linuxcnc_v1_NurbsG5Data | null);
  'nurbsG6'?: (_linuxcnc_v1_NurbsG6Data | null);
  'unitsChange'?: (_linuxcnc_v1_UnitsChangeData | null);
  'planeChange'?: (_linuxcnc_v1_PlaneChangeData | null);
  'g5xOffset'?: (_linuxcnc_v1_G5xOffsetData | null);
  'g92Offset'?: (_linuxcnc_v1_OffsetData | null);
  'xyRotation'?: (_linuxcnc_v1_RotationData | null);
  'toolOffset'?: (_linuxcnc_v1_OffsetData | null);
  'toolChange'?: (_linuxcnc_v1_ToolChangeData | null);
  'feedRateChange'?: (_linuxcnc_v1_FeedRateData | null);
  'cutterCompensationChange'?: (_linuxcnc_v1_CutterCompensationData | null);
  'data'?: "arc"|"probe"|"rigidTap"|"dwell"|"nurbsG5"|"nurbsG6"|"unitsChange"|"planeChange"|"g5xOffset"|"g92Offset"|"xyRotation"|"toolOffset"|"toolChange"|"feedRateChange"|"cutterCompensationChange";
}

export interface GCodeOperation__Output {
  'type'?: (_linuxcnc_v1_OperationType__Output);
  'lineNumber'?: (number);
  'pos'?: (_linuxcnc_v1_Position__Output);
  'arc'?: (_linuxcnc_v1_ArcData__Output);
  'probe'?: (_linuxcnc_v1_ProbeData__Output);
  'rigidTap'?: (_linuxcnc_v1_RigidTapData__Output);
  'dwell'?: (_linuxcnc_v1_DwellData__Output);
  'nurbsG5'?: (_linuxcnc_v1_NurbsG5Data__Output);
  'nurbsG6'?: (_linuxcnc_v1_NurbsG6Data__Output);
  'unitsChange'?: (_linuxcnc_v1_UnitsChangeData__Output);
  'planeChange'?: (_linuxcnc_v1_PlaneChangeData__Output);
  'g5xOffset'?: (_linuxcnc_v1_G5xOffsetData__Output);
  'g92Offset'?: (_linuxcnc_v1_OffsetData__Output);
  'xyRotation'?: (_linuxcnc_v1_RotationData__Output);
  'toolOffset'?: (_linuxcnc_v1_OffsetData__Output);
  'toolChange'?: (_linuxcnc_v1_ToolChangeData__Output);
  'feedRateChange'?: (_linuxcnc_v1_FeedRateData__Output);
  'cutterCompensationChange'?: (_linuxcnc_v1_CutterCompensationData__Output);
  'data'?: "arc"|"probe"|"rigidTap"|"dwell"|"nurbsG5"|"nurbsG6"|"unitsChange"|"planeChange"|"g5xOffset"|"g92Offset"|"xyRotation"|"toolOffset"|"toolChange"|"feedRateChange"|"cutterCompensationChange";
}
