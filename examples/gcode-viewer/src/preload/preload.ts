import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  selectIni: () => ipcRenderer.invoke("dialog:selectIni"),
  getIniPath: () => ipcRenderer.invoke("ini:getPath"),
  onProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on("gcode:progress", (_event, value) => callback(value));
  },
  onIniChanged: (callback: (iniPath: string) => void) => {
    ipcRenderer.on("ini:changed", (_event, value) => callback(value));
  },
});
