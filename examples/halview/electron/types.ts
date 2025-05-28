import type {
  HalType,
  HalPinInfo,
  HalSignalInfo,
  HalParamInfo,
} from "@linuxcnc-node/hal";

export interface HalPinData extends HalPinInfo {
  typeName: string;
  directionName: string;
  isWritable: boolean;
}

export interface HalSignalData extends HalSignalInfo {
  typeName: string;
  isWritable: boolean;
}

export interface HalParamData extends HalParamInfo {
  typeName: string;
  directionName: string;
  isWritable: boolean;
}

export type HalItemData = HalPinData | HalParamData | HalSignalData;

export interface FullHalData {
  pins: HalPinData[];
  params: HalParamData[];
  signals: HalSignalData[];
}

export interface TreeItem {
  id: string;
  name: string;
  fullName?: string;
  itemType: "pin" | "param" | "signal" | "folder" | "component" | "root";
  children: TreeItem[];
  data?: HalItemData;
  isExpanded?: boolean;
}

export interface WatchListItem {
  name: string;
  type: "pin" | "param" | "signal";
  value: any;
  dataType: HalType;
  dataTypeName: string;
  isWritable: boolean;
  details?: HalItemData;
}

export interface Preset {
  name: string;
  items: string[];
}

export const IPC_CHANNELS = {
  GET_HAL_DATA: "get-hal-data",
  HAL_DATA_RESPONSE: "hal-data-response",
  GET_ITEM_VALUE: "get-item-value",
  ITEM_VALUE_UPDATED: "item-value-updated",
  GET_ITEM_DETAILS: "get-item-details",
  ITEM_DETAILS_RESPONSE: "item-details-response",
  EXECUTE_HAL_COMMAND: "execute-hal-command",
  HAL_COMMAND_RESULT: "hal-command-result",
  UPDATE_WATCH_LIST: "update-watch-list",
  SAVE_PRESET: "save-preset",
  LOAD_PRESETS_REQUEST: "load-presets-request",
  LOAD_PRESETS_RESPONSE: "load-presets-response",
  APPLY_PRESET: "apply-preset",
  SET_WATCH_INTERVAL: "set-watch-interval",
  GET_SETTINGS: "get-settings",
  SETTINGS_RESPONSE: "settings-response",
  LOG_MESSAGE: "log-message",
};
