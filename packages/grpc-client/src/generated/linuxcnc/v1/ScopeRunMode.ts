// Original file: proto/linuxcnc/v1/scope.proto

export const ScopeRunMode = {
  SCOPE_RUN_MODE_UNSPECIFIED: 0,
  SCOPE_RUN_MODE_RUN: 1,
  SCOPE_RUN_MODE_SINGLE: 2,
  SCOPE_RUN_MODE_ROLL: 3,
} as const;

export type ScopeRunMode =
  | 'SCOPE_RUN_MODE_UNSPECIFIED'
  | 0
  | 'SCOPE_RUN_MODE_RUN'
  | 1
  | 'SCOPE_RUN_MODE_SINGLE'
  | 2
  | 'SCOPE_RUN_MODE_ROLL'
  | 3

export type ScopeRunMode__Output = typeof ScopeRunMode[keyof typeof ScopeRunMode]
