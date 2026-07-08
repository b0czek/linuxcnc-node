import { contextBridge, ipcRenderer } from "electron";
import { FullHalData, IPC_CHANNELS } from "./types";

contextBridge.exposeInMainWorld("electronAPI", {
  getHalData: (): Promise<FullHalData | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_HAL_DATA),
  getItemValue: (itemName: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ITEM_VALUE, itemName),
  getItemDetails: (itemName: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ITEM_DETAILS, itemName),
  updateWatchList: (itemNames: string[]) =>
    ipcRenderer.send(IPC_CHANNELS.UPDATE_WATCH_LIST, itemNames),
  executeHalCommand: (
    command: string,
    args: any[]
  ): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXECUTE_HAL_COMMAND, { command, args }),
  savePreset: (
    name: string,
    items: string[]
  ): Promise<{ success: boolean; presets: { [name: string]: string[] } }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_PRESET, { name, items }),
  loadPresets: (): Promise<{ [name: string]: string[] }> =>
    ipcRenderer.invoke(IPC_CHANNELS.LOAD_PRESETS_REQUEST),
  setWatchInterval: (interval: number) =>
    ipcRenderer.send(IPC_CHANNELS.SET_WATCH_INTERVAL, interval),
  getSettings: (): Promise<{ watchInterval: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),

  onItemValueUpdated: (
    callback: (data: { name: string; value: any }) => void
  ) => {
    const handler = (_event: any, data: { name: string; value: any }) =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.ITEM_VALUE_UPDATED, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.ITEM_VALUE_UPDATED, handler);
  },
  onLogMessage: (
    callback: (data: { type: "info" | "error"; message: string }) => void
  ) => {
    const handler = (
      _event: any,
      data: { type: "info" | "error"; message: string }
    ) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.LOG_MESSAGE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LOG_MESSAGE, handler);
  },
  onSettingsUpdate: (
    callback: (settings: { watchInterval: number }) => void
  ) => {
    const handler = (_event: any, settings: { watchInterval: number }) =>
      callback(settings);
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_RESPONSE, handler); // Listen to settings updates
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_RESPONSE, handler);
  },
});

declare global {
  interface Window {
    electronAPI: {
      getHalData: () => Promise<FullHalData | null>;
      getItemValue: (itemName: string) => Promise<any>;
      getItemDetails: (itemName: string) => Promise<any>;
      updateWatchList: (itemNames: string[]) => void;
      executeHalCommand: (
        command: string,
        args: any[]
      ) => Promise<{ success: boolean; message: string }>;
      savePreset: (
        name: string,
        items: string[]
      ) => Promise<{ success: boolean; presets: { [name: string]: string[] } }>;
      loadPresets: () => Promise<{ [name: string]: string[] }>;
      setWatchInterval: (interval: number) => void;
      getSettings: () => Promise<{ watchInterval: number }>;

      onItemValueUpdated: (
        callback: (data: { name: string; value: any }) => void
      ) => () => void;
      onLogMessage: (
        callback: (data: { type: "info" | "error"; message: string }) => void
      ) => () => void;
      onSettingsUpdate: (
        callback: (settings: { watchInterval: number }) => void
      ) => () => void;
    };
  }
}
