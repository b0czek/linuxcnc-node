// --- Exported types ---
export type {
  HalType,
  HalPinDir,
  HalParamDir,
  RtapiMsgLevel,
  HalPinInfo,
  HalSignalInfo,
  HalParamInfo,
  HalValue,
  HalItemKind,
  HalItemRef,
  HalComponentKind,
  HalComponentInfo,
  HalFunctionInfo,
  HalThreadInfo,
  ScopeRuntimeState,
  ScopeChannelConfig,
  ScopeAcquisitionConfig,
  ScopeStatus,
  ScopeCapture,
  ScopeCaptureDelta,
} from "@linuxcnc-node/types";

// --- Exported classes ---
export { HalComponent } from "./component";
export { HalItem, Pin, Param } from "./item";
export { ScopeController } from "./scope";
export type { HalMonitorOptions, HalDelta } from "./component";

// --- Global functions ---
export {
  getMsgLevel,
  setMsgLevel,
  connect,
  disconnect,
  getValue,
  getValues,
  getInfoComponents,
  getInfoFunctions,
  getInfoThreads,
  getInfoPins,
  getInfoSignals,
  getInfoParams,
  newSignal,
  pinHasWriter,
  setPinParamValue,
  setSignalValue,
} from "./functions";
