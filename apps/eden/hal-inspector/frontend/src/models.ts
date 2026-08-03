import type { HalItemRef, HalValue } from "@linuxcnc-node/types";

export type Category =
  | "components"
  | "pins"
  | "params"
  | "signals"
  | "functions"
  | "threads";

export type ActiveTab = "browse" | "watch" | "scope";

export type Row = {
  id: string;
  name: string;
  kind: Category;
  ref?: HalItemRef;
  value?: HalValue;
  type?: string;
  writable?: boolean;
  subtitle?: string;
};

export type TreeRow = Row & {
  depth: number;
  guideDepth: number;
  displayName: string;
  groupKey?: string;
  groupCount?: number;
};

export interface ScopeChannelDisplay {
  unitsPerDivision: number;
  offset: number;
}

export interface Preferences {
  version: 2;
  watches: HalItemRef[];
  intervalMs: number;
  drawerExpanded: boolean;
  channels: Array<HalItemRef | null>;
  threadName?: string;
  multiplier: number;
  triggerMode: "auto" | "normal";
  triggerChannel: number;
  triggerEdge: "rising" | "falling";
  triggerLevel: number;
  preTriggerRatio: number;
  scopeDisplays: ScopeChannelDisplay[];
  activeScopeChannel: number;
}

export const defaultScopeDisplays = (): ScopeChannelDisplay[] =>
  Array.from({ length: 16 }, () => ({ unitsPerDivision: 1, offset: 0 }));

export const DEFAULT_PREFERENCES: Preferences = {
  version: 2,
  watches: [],
  intervalMs: 100,
  drawerExpanded: false,
  channels: Array(16).fill(null),
  multiplier: 1,
  triggerMode: "auto",
  triggerChannel: 0,
  triggerEdge: "rising",
  triggerLevel: 0,
  preTriggerRatio: 0.5,
  scopeDisplays: defaultScopeDisplays(),
  activeScopeChannel: 0,
};
