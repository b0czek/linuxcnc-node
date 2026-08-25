// Original file: proto/linuxcnc/v1/common.proto

export const ProgramUnits = {
  PROGRAM_UNITS_UNSPECIFIED: 0,
  PROGRAM_UNITS_INCH: 1,
  PROGRAM_UNITS_MM: 2,
  PROGRAM_UNITS_CM: 3,
} as const;

export type ProgramUnits =
  | 'PROGRAM_UNITS_UNSPECIFIED'
  | 0
  | 'PROGRAM_UNITS_INCH'
  | 1
  | 'PROGRAM_UNITS_MM'
  | 2
  | 'PROGRAM_UNITS_CM'
  | 3

export type ProgramUnits__Output = typeof ProgramUnits[keyof typeof ProgramUnits]
