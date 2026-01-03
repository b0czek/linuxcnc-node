import { GCodeParseResult } from "@linuxcnc-node/gcode";

// Define the interface for the exposed Electron API
export interface ElectronAPI {
  openFile: () => Promise<{
    success: boolean;
    result?: GCodeParseResult;
    gcodeContent?: string;
    filePath?: string;
    error?: string;
  }>;
  selectIni: () => Promise<{ success: boolean; iniPath?: string }>;
  getIniPath: () => Promise<string | null>;
  onProgress: (callback: (progress: any) => void) => void;
  onIniChanged: (callback: (iniPath: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
