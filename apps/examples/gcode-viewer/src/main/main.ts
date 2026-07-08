import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import fs from "fs";
import { parseGCode } from "@linuxcnc-node/gcode";
import { GCodeParseResult } from "@linuxcnc-node/types";

process.env.DIST = path.join(__dirname, "../dist");
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, "../public");

let win: BrowserWindow | null;
let cachedIniPath: string | null = null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: "#1a1a1a",
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST || "", "index.html"));
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  createWindow();

  // Handler to select/change INI file
  ipcMain.handle("dialog:selectIni", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Select LinuxCNC INI File",
      properties: ["openFile"],
      filters: [{ name: "INI Files", extensions: ["ini"] }],
    });
    if (canceled || filePaths.length === 0) {
      return { success: false };
    }
    cachedIniPath = filePaths[0];
    return { success: true, iniPath: cachedIniPath };
  });

  // Handler to get current INI path
  ipcMain.handle("ini:getPath", () => {
    return cachedIniPath;
  });

  ipcMain.handle("dialog:openFile", async () => {
    // If no INI file is selected yet, prompt for one first
    if (!cachedIniPath) {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Select LinuxCNC INI File (required for parsing)",
        properties: ["openFile"],
        filters: [{ name: "INI Files", extensions: ["ini"] }],
      });
      if (canceled || filePaths.length === 0) {
        return {
          success: false,
          error: "INI file is required for G-code parsing",
        };
      }
      cachedIniPath = filePaths[0];
      if (win) win.webContents.send("ini:changed", cachedIniPath);
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "G-Code", extensions: ["ngc", "nc", "gcode"] }],
    });
    if (canceled) {
      return;
    }

    try {
      const iniPath = app.isPackaged
        ? cachedIniPath || path.join(process.resourcesPath, "linuxcnc.ini")
        : cachedIniPath!;

      // Read raw G-code file content
      const gcodeContent = await fs.promises.readFile(filePaths[0], "utf-8");

      const result: GCodeParseResult = await parseGCode(filePaths[0], {
        iniPath: iniPath,
        onProgress: (progress) => {
          if (win) win.webContents.send("gcode:progress", progress);
        },
      });
      return { success: true, result, gcodeContent, filePath: filePaths[0] };
    } catch (error: any) {
      console.error("Parse error:", error);
      return { success: false, error: error.message };
    }
  });
});
