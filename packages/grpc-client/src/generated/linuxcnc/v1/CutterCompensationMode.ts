// Original file: proto/linuxcnc/v1/program.proto

export const CutterCompensationMode = {
  CUTTER_COMPENSATION_MODE_UNSPECIFIED: 0,
  CUTTER_COMPENSATION_MODE_OFF: 1,
  CUTTER_COMPENSATION_MODE_LEFT: 2,
  CUTTER_COMPENSATION_MODE_RIGHT: 3,
} as const;

export type CutterCompensationMode =
  | 'CUTTER_COMPENSATION_MODE_UNSPECIFIED'
  | 0
  | 'CUTTER_COMPENSATION_MODE_OFF'
  | 1
  | 'CUTTER_COMPENSATION_MODE_LEFT'
  | 2
  | 'CUTTER_COMPENSATION_MODE_RIGHT'
  | 3

export type CutterCompensationMode__Output = typeof CutterCompensationMode[keyof typeof CutterCompensationMode]
