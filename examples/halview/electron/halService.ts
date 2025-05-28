import * as hal from "@linuxcnc-node/hal";
import { BrowserWindow, ipcMain } from "electron";
import Store from "electron-store";
import {
  FullHalData,
  HalPinData,
  HalParamData,
  HalSignalData,
  IPC_CHANNELS,
} from "./types";
import { HalComponentInstance } from "@linuxcnc-node/hal/dist/component";

function getHalTypeName(typeValue: hal.HalType): string {
  for (const key in hal) {
    if (
      hal[key as keyof typeof hal] === typeValue &&
      key.startsWith("HAL_") &&
      !key.includes("DIR") &&
      !key.includes("MSG_")
    ) {
      return key;
    }
  }
  return "UNKNOWN_TYPE";
}
function getHalPinDirName(dirValue: hal.HalPinDir): string {
  if (dirValue === hal.HAL_IN) return "HAL_IN";
  if (dirValue === hal.HAL_OUT) return "HAL_OUT";
  if (dirValue === hal.HAL_IO) return "HAL_IO";
  return "UNKNOWN_PIN_DIR";
}
function getHalParamDirName(dirValue: hal.HalParamDir): string {
  if (dirValue === hal.HAL_RO) return "HAL_RO";
  if (dirValue === hal.HAL_RW) return "HAL_RW";
  return "UNKNOWN_PARAM_DIR";
}

const store = new Store<{
  presets: { [name: string]: string[] };
  settings: { watchInterval: number };
}>({
  defaults: {
    presets: { Default: [] },
    settings: { watchInterval: 200 },
  },
});

class HalService {
  private watchedItems: string[] = [];
  private watchIntervalId?: NodeJS.Timeout;
  private mainWindow?: BrowserWindow;
  private currentWatchInterval: number = store.get(
    "settings.watchInterval",
    200
  );

  // needed to access HAL data at all
  // @ts-ignore: ignore unused warning
  private component: HalComponentInstance;

  constructor() {
    this.setupIpcHandlers();

    this.component = hal.component(`halview-${Date.now()}`);

    this.logToRenderer("HalService initialized.");
  }

  public setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
    // Send initial settings once window is set
    this.mainWindow.webContents.on("did-finish-load", () => {
      this.mainWindow?.webContents.send(
        IPC_CHANNELS.SETTINGS_RESPONSE,
        store.get("settings")
      );
    });
  }

  private logToRenderer(message: string, type: "info" | "error" = "info") {
    this.mainWindow?.webContents.send(IPC_CHANNELS.LOG_MESSAGE, {
      type,
      message,
    });
    if (type === "error") console.error(`HalService: ${message}`);
    else console.log(`HalService: ${message}`);
  }

  private setupIpcHandlers() {
    ipcMain.handle(
      IPC_CHANNELS.GET_HAL_DATA,
      async (): Promise<FullHalData | null> => {
        try {
          const pinsInfo = await hal.getInfoPins();
          const paramsInfo = await hal.getInfoParams();
          const signalsInfo = await hal.getInfoSignals();

          const pins: HalPinData[] = pinsInfo.map((p) => ({
            ...p,
            typeName: getHalTypeName(p.type),
            directionName: getHalPinDirName(p.direction),
            isWritable:
              p.direction === hal.HAL_IN || p.direction === hal.HAL_IO,
          }));
          const params: HalParamData[] = paramsInfo.map((p) => ({
            ...p,
            typeName: getHalTypeName(p.type),
            directionName: getHalParamDirName(p.direction),
            isWritable: p.direction === hal.HAL_RW,
          }));
          const signals: HalSignalData[] = signalsInfo.map((s) => ({
            ...s,
            typeName: getHalTypeName(s.type),
            isWritable: s.writers === 0,
          }));

          this.logToRenderer(
            `Fetched HAL data: ${pins.length} pins, ${params.length} params, ${signals.length} signals.`
          );
          return { pins, params, signals };
        } catch (error) {
          this.logToRenderer(
            `Error in GET_HAL_DATA: ${(error as Error).message}`,
            "error"
          );
          return null;
        }
      }
    );

    ipcMain.handle(IPC_CHANNELS.GET_ITEM_VALUE, async (_, itemName: string) => {
      try {
        return await hal.getValue(itemName);
      } catch (error) {
        this.logToRenderer(
          `Error getting value for ${itemName}: ${(error as Error).message}`,
          "error"
        );
        return null;
      }
    });

    ipcMain.handle(
      IPC_CHANNELS.GET_ITEM_DETAILS,
      async (
        _,
        itemName: string
      ): Promise<HalPinData | HalParamData | HalSignalData | null> => {
        try {
          const pins = await hal.getInfoPins();
          const pinInfo = pins.find((p) => p.name === itemName);
          if (pinInfo)
            return {
              ...pinInfo,
              typeName: getHalTypeName(pinInfo.type),
              directionName: getHalPinDirName(pinInfo.direction),
              isWritable:
                pinInfo.direction === hal.HAL_IN ||
                pinInfo.direction === hal.HAL_IO,
            };

          const params = await hal.getInfoParams();
          const paramInfo = params.find((p) => p.name === itemName);
          if (paramInfo)
            return {
              ...paramInfo,
              typeName: getHalTypeName(paramInfo.type),
              directionName: getHalParamDirName(paramInfo.direction),
              isWritable: paramInfo.direction === hal.HAL_RW,
            };

          const signals = await hal.getInfoSignals();
          const signalInfo = signals.find((s) => s.name === itemName);
          if (signalInfo)
            return {
              ...signalInfo,
              typeName: getHalTypeName(signalInfo.type),
              isWritable: signalInfo.writers === 0,
            };

          this.logToRenderer(
            `Item ${itemName} not found for details.`,
            "error"
          );
          return null;
        } catch (error) {
          this.logToRenderer(
            `Error getting details for ${itemName}: ${
              (error as Error).message
            }`,
            "error"
          );
          return null;
        }
      }
    );

    ipcMain.on(IPC_CHANNELS.UPDATE_WATCH_LIST, (_, itemNames: string[]) => {
      this.watchedItems = itemNames;
      this.logToRenderer(`Watch list updated. Items: ${itemNames.join(", ")}`);
      this.stopWatching();
      if (this.watchedItems.length > 0) {
        this.startWatching();
      }
    });

    ipcMain.handle(
      IPC_CHANNELS.EXECUTE_HAL_COMMAND,
      async (_, { command, args }: { command: string; args: any[] }) => {
        this.logToRenderer(
          `Executing HAL command: ${command} with args: ${args.join(", ")}`
        );
        try {
          let val: any; // Declare val outside switch if used in multiple cases
          switch (command) {
            case "setp":
              if (args.length < 2)
                throw new Error("setp requires name and value");
              val = args[1];
              if (!isNaN(parseFloat(val)) && isFinite(val as any))
                val = parseFloat(val);
              else if (String(val).toLowerCase() === "true") val = true;
              else if (String(val).toLowerCase() === "false") val = false;
              await hal.setPinParamValue(args[0] as string, val);
              return { success: true, message: `${args[0]} set to ${val}` };
            case "sets":
              if (args.length < 2)
                throw new Error("sets requires name and value");
              val = args[1];
              if (!isNaN(parseFloat(val)) && isFinite(val as any))
                val = parseFloat(val);
              else if (String(val).toLowerCase() === "true") val = true;
              else if (String(val).toLowerCase() === "false") val = false;
              await hal.setSignalValue(args[0] as string, val);
              return { success: true, message: `${args[0]} set to ${val}` };
            case "linkps":
              if (args.length < 2)
                throw new Error("linkps requires pin name and signal name");
              await hal.connect(args[0] as string, args[1] as string);
              return {
                success: true,
                message: `Pin ${args[0]} linked to signal ${args[1]}`,
              };
            case "unlinkp":
              if (args.length < 1) throw new Error("unlinkp requires pin name");
              await hal.disconnect(args[0] as string);
              return { success: true, message: `Pin ${args[0]} unlinked` };
            case "newsig":
              if (args.length < 2)
                throw new Error("newsig requires signal name and type");
              const halType = (hal as any)[args[1] as string];
              if (halType === undefined)
                throw new Error(`Invalid HAL type: ${args[1]}`);
              await hal.newSignal(args[0] as string, halType as hal.HalType);
              return {
                success: true,
                message: `Signal ${args[0]} (${args[1]}) created`,
              };
            default:
              throw new Error(`Unsupported HAL command: ${command}`);
          }
        } catch (error) {
          const errorMessage = `Error executing ${command}: ${
            (error as Error).message
          }`;
          this.logToRenderer(errorMessage, "error");
          return { success: false, message: errorMessage };
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.SAVE_PRESET,
      async (_, { name, items }: { name: string; items: string[] }) => {
        store.set(`presets.${name}`, items);
        this.logToRenderer(
          `Preset '${name}' saved with ${items.length} items.`
        );
        return { success: true, presets: store.get("presets") };
      }
    );

    ipcMain.handle(IPC_CHANNELS.LOAD_PRESETS_REQUEST, async () => {
      return store.get("presets");
    });

    ipcMain.on(IPC_CHANNELS.SET_WATCH_INTERVAL, (_, interval: number) => {
      if (interval > 0) {
        this.currentWatchInterval = interval;
        store.set("settings.watchInterval", interval);
        this.logToRenderer(`Watch interval set to ${interval}ms.`);
        if (this.watchIntervalId) {
          this.stopWatching();
          this.startWatching();
        }
        this.mainWindow?.webContents.send(
          IPC_CHANNELS.SETTINGS_RESPONSE,
          store.get("settings")
        );
      }
    });

    ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => {
      return store.get("settings");
    });
  }

  private startWatching() {
    if (this.watchedItems.length === 0 || !this.mainWindow) {
      this.stopWatching();
      return;
    }
    this.logToRenderer(
      `Starting watch with interval ${this.currentWatchInterval}ms for ${this.watchedItems.length} items.`
    );
    this.watchIntervalId = setInterval(async () => {
      if (!this.mainWindow || this.watchedItems.length === 0) {
        this.stopWatching();
        return;
      }
      for (const itemName of this.watchedItems) {
        try {
          const value = await hal.getValue(itemName);
          this.mainWindow.webContents.send(IPC_CHANNELS.ITEM_VALUE_UPDATED, {
            name: itemName,
            value,
          });
        } catch (error) {
          this.logToRenderer(
            `Error watching ${itemName}: ${(error as Error).message}`,
            "error"
          );
        }
      }
    }, this.currentWatchInterval);
  }

  private stopWatching() {
    if (this.watchIntervalId) {
      clearInterval(this.watchIntervalId);
      this.watchIntervalId = undefined;
      this.logToRenderer("Stopped watching.");
    }
  }
}

export const halService = new HalService();
