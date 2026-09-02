import {
  DEFAULT_PREFERENCES,
  defaultScopeDisplays,
  type Preferences,
} from "./models";

const CURRENT_KEY = "hal-inspector.preferences.v2";

function defaults(): Preferences {
  return {
    ...DEFAULT_PREFERENCES,
    watches: [],
    channels: Array(16).fill(null),
    scopeDisplays: defaultScopeDisplays(),
  };
}

function normalize(stored: string | null | undefined): Preferences {
  if (!stored) return defaults();
  const parsed = JSON.parse(stored) as Omit<Partial<Preferences>, "version"> & {
    version?: number;
  };
  if (parsed.version !== 2) return defaults();
  const fallback = defaults();
  const displays = parsed.scopeDisplays ?? [];
  return {
    ...fallback,
    watches: parsed.watches ?? [],
    intervalMs: parsed.intervalMs ?? fallback.intervalMs,
    drawerExpanded: parsed.drawerExpanded ?? false,
    channels: Array.from(
      { length: 16 },
      (_, index) => parsed.channels?.[index] ?? null,
    ),
    threadName: parsed.threadName ?? "",
    multiplier: Math.max(1, parsed.multiplier ?? 1),
    triggerMode: parsed.triggerMode ?? "auto",
    triggerChannel: Math.max(0, Math.min(15, parsed.triggerChannel ?? 0)),
    triggerEdge: parsed.triggerEdge ?? "rising",
    triggerLevel: parsed.triggerLevel ?? 0,
    preTriggerRatio: parsed.preTriggerRatio ?? 0.5,
    scopeDisplays: Array.from({ length: 16 }, (_, index) => {
      const display = displays[index];
      return {
        unitsPerDivision:
          display?.unitsPerDivision &&
          Number.isFinite(display.unitsPerDivision) &&
          display.unitsPerDivision > 0
            ? display.unitsPerDivision
            : 1,
        offset: Number.isFinite(display?.offset) ? Number(display?.offset) : 0,
      };
    }),
    activeScopeChannel: Math.max(
      0,
      Math.min(15, parsed.activeScopeChannel ?? 0),
    ),
  };
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    const stored = await window.edenAPI.shellCommand("db/get", {
      key: CURRENT_KEY,
    });
    return normalize(stored.value);
  } catch {
    return defaults();
  }
}

export async function savePreferences(value: Preferences): Promise<void> {
  await window.edenAPI.shellCommand("db/set", {
    key: CURRENT_KEY,
    value: JSON.stringify(value),
  });
}
