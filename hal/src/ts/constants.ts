// Re-export HAL types from @linuxcnc/types
export type {
  HalType,
  HalPinDir,
  HalParamDir,
  RtapiMsgLevel,
  HalPinInfo,
  HalSignalInfo,
  HalParamInfo,
} from "@linuxcnc/types";

import type {
  HalType,
  HalPinDir,
  HalParamDir,
  RtapiMsgLevel,
} from "@linuxcnc/types";

// Native addon - loaded once on module import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadAddon(): any {
  const paths = [
    "../build/Release/hal_addon.node",
    "../../build/Release/hal_addon.node",
  ];

  for (const path of paths) {
    try {
      return require(path);
    } catch {
      // Try next path
    }
  }

  throw new Error(
    "Failed to load linuxcnc-node hal native addon. Please ensure it's built correctly and that LinuxCNC is in your PATH."
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const halNative: any = loadAddon();

// Numeric value mappings for native interop
export const HalTypeValue: Record<HalType, number> = {
  bit: 1,
  float: 2,
  s32: 3,
  u32: 4,
  s64: 6,
  u64: 7,
};

export const HalPinDirValue: Record<HalPinDir, number> = {
  in: 16,
  out: 32,
  io: 48,
};

export const HalParamDirValue: Record<HalParamDir, number> = {
  ro: 64,
  rw: 192,
};

export const RtapiMsgLevelValue: Record<RtapiMsgLevel, number> = {
  none: 0,
  err: 1,
  warn: 2,
  info: 3,
  dbg: 4,
  all: 5,
};

// Helper to generate reverse mapping
function createReverseMap<K extends string, V extends number>(
  map: Record<K, V>
): Record<number, K> {
  const reverse: Record<number, K> = {};
  for (const [key, value] of Object.entries(map)) {
    reverse[value as number] = key as K;
  }
  return reverse;
}

// Reverse mappings for native -> TS conversion
export const HalTypeFromValue: Record<number, HalType> =
  createReverseMap(HalTypeValue);

export const HalPinDirFromValue: Record<number, HalPinDir> =
  createReverseMap(HalPinDirValue);

export const HalParamDirFromValue: Record<number, HalParamDir> =
  createReverseMap(HalParamDirValue);

export const RtapiMsgLevelFromValue: Record<number, RtapiMsgLevel> =
  createReverseMap(RtapiMsgLevelValue);
