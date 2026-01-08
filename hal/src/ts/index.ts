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
} from "@linuxcnc-node/types";

// --- Exported classes ---
export { HalComponent } from "./component";
export { HalItem, Pin, Param } from "./item";
export type { HalMonitorOptions, HalDelta } from "./component";

// --- Global functions ---
export {
  getMsgLevel,
  setMsgLevel,
  connect,
  disconnect,
  getValue,
  getInfoPins,
  getInfoSignals,
  getInfoParams,
  newSignal,
  pinHasWriter,
  setPinParamValue,
  setSignalValue,
} from "./functions";
