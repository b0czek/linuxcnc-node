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

export interface Preferences {
  version: 1;
  watches: HalItemRef[];
  intervalMs: number;
  drawerExpanded: boolean;
  channels: Array<HalItemRef | null>;
  threadName?: string;
  multiplier: number;
  triggerMode: "auto" | "normal";
  triggerEdge: "rising" | "falling";
  triggerLevel: number;
  preTriggerRatio: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  watches: [],
  intervalMs: 100,
  drawerExpanded: false,
  channels: Array(16).fill(null),
  multiplier: 1,
  triggerMode: "auto",
  triggerEdge: "rising",
  triggerLevel: 0,
  preTriggerRatio: 0.5,
};
