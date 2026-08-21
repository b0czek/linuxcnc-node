// Stable LinuxCNC domain constants.  The enum declarations are generated from
// proto/linuxcnc/v1/linuxcnc.proto; this compatibility barrel preserves the
// long-standing import path used by downstream consumers.
export {
  TaskMode,
  TaskState,
  RcsStatus,
  ExecState,
  InterpState,
  StopState,
  TrajMode,
  MotionType,
  KinematicsType,
  ProgramUnits,
  NmlMessageType,
  JointType,
  OrientState,
  EmcDebug,
  OperationType,
  Plane,
} from "./generated/enums";
