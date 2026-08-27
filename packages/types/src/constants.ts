// Stable LinuxCNC domain constants.  The enum declarations are generated from
// the proto/linuxcnc/v1 schema set; this compatibility barrel preserves the
// long-standing import path used by downstream consumers.
export {
  CutterCompensationMode,
  EmcDebug,
  ExecState,
  InterpState,
  JointType,
  KinematicsType,
  MotionType,
  NmlMessageType,
  OperationType,
  OrientState,
  Plane,
  ProgramUnits,
  RcsStatus,
  StopState,
  TaskMode,
  TaskState,
  TrajMode,
} from "./generated/enums";
