import * as Dialog from "@kobalte/core/dialog";
import * as Tabs from "@kobalte/core/tabs";
import { createVirtualizer } from "@tanstack/solid-virtual";
import {
  FaSolidBars,
  FaSolidBolt,
  FaSolidChartLine,
  FaSolidChevronDown,
  FaSolidChevronRight,
  FaSolidChevronUp,
  FaSolidCircleDot,
  FaSolidClock,
  FaSolidCode,
  FaSolidCubes,
  FaSolidMagnifyingGlass,
  FaSolidMinus,
  FaSolidPenToSquare,
  FaSolidPlay,
  FaSolidPlus,
  FaSolidRotateRight,
  FaSolidSliders,
  FaSolidSquare,
  FaSolidThumbTack,
  FaSolidWaveSquare,
  FaSolidXmark,
} from "solid-icons/fa";
import type { PeerConnection } from "@edenapp/types/ipc";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";
import type {
  HalItemRef,
  HalValue,
  ScopeAcquisitionConfig,
  ScopeCapture,
  ScopeStatus,
} from "@linuxcnc-node/types";
import type {
  HalInspectorProtocol,
  TopologySnapshot,
} from "../../shared/protocol";
import { initLocale, t } from "./i18n";
import { ScopePlot } from "./ScopePlot";

type Category =
  | "components"
  | "pins"
  | "params"
  | "signals"
  | "functions"
  | "threads";
type Row = {
  id: string;
  name: string;
  kind: Category;
  ref?: HalItemRef;
  value?: HalValue;
  type?: string;
  writable?: boolean;
  subtitle?: string;
};
type TreeRow = Row & {
  depth: number;
  guideDepth: number;
  displayName: string;
  groupKey?: string;
  groupCount?: number;
};
interface Preferences {
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
const DEFAULTS: Preferences = {
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
const categoryLabels: Record<Category, () => string> = {
  components: () => t("inspector.components"),
  pins: () => t("inspector.pins"),
  params: () => t("inspector.parameters"),
  signals: () => t("inspector.signals"),
  functions: () => t("inspector.functions"),
  threads: () => t("inspector.threads"),
};
const key = (ref: HalItemRef) => `${ref.kind}:${ref.name}`;
const MAX_INLINE_VALUE_CHARS = 14;
const formatInlineValue = (value: HalValue | undefined): string => {
  if (value === undefined) return "—";
  const plain = String(value);
  if (typeof value !== "number" || plain.length <= MAX_INLINE_VALUE_CHARS)
    return plain;
  const magnitude = Math.abs(value);
  if (magnitude >= 1e14 || (magnitude > 0 && magnitude < 1e-6))
    return value
      .toExponential(6)
      .replace(/(\.\d*?[1-9])0+e/, "$1e")
      .replace(/\.0+e/, "e");
  const integerChars = Math.trunc(magnitude).toString().length +
    (value < 0 ? 1 : 0);
  const decimalPlaces = Math.max(
    0,
    MAX_INLINE_VALUE_CHARS - integerChars - 1
  );
  return value.toFixed(decimalPlaces).replace(/\.?0+$/, "");
};
const TYPE_COLORS: Record<string, string> = {
  bit: "#55d48a",
  float: "#f2b94b",
  s32: "#61a9ff",
  u32: "#51d4ef",
  s64: "#9f7dff",
  u64: "#e178ff",
  port: "#9aa6ac",
  default: "#c2d0d6",
};

type NameNode = {
  segment: string;
  path: string;
  children: Map<string, NameNode>;
  rows: Row[];
};

function buildTreeRows(
  rows: Row[],
  namespace: string,
  expanded: Set<string>,
  forceExpanded: boolean
): TreeRow[] {
  const root: NameNode = {
    segment: "",
    path: "",
    children: new Map(),
    rows: [],
  };
  for (const row of rows) {
    const parts = row.name.split(".").filter(Boolean);
    if (parts.length === 0) {
      root.rows.push(row);
      continue;
    }
    let node = root;
    for (const segment of parts) {
      const path = node.path ? `${node.path}.${segment}` : segment;
      let child = node.children.get(segment);
      if (!child) {
        child = { segment, path, children: new Map(), rows: [] };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.rows.push(row);
  }

  const countRows = (node: NameNode): number =>
    node.rows.length +
    [...node.children.values()].reduce(
      (total, child) => total + countRows(child),
      0
    );
  const result: TreeRow[] = [];
  const append = (node: NameNode, depth: number) => {
    const children = [...node.children.values()].sort((a, b) =>
      a.segment.localeCompare(b.segment)
    );
    for (const child of children) {
      if (child.children.size > 0) {
        const groupKey = `${namespace}:${child.path}`;
        result.push({
          id: `group:${groupKey}`,
          name: child.path,
          displayName: child.segment,
          kind: rows[0]?.kind ?? "pins",
          depth,
          guideDepth: depth,
          groupKey,
          groupCount: countRows(child),
        });
        if (forceExpanded || expanded.has(groupKey)) {
          for (const row of child.rows)
            result.push({
              ...row,
              displayName: child.segment,
              depth: depth + 1,
              guideDepth: depth + 1,
            });
          append(child, depth + 1);
        }
      } else {
        for (const row of child.rows)
          result.push({
            ...row,
            displayName: child.segment,
            depth,
            guideDepth: depth,
          });
      }
    }
  };

  for (const row of root.rows)
    result.push({ ...row, displayName: row.name, depth: 0, guideDepth: 0 });
  append(root, 0);
  return result;
}

const App: Component = () => {
  const api = window.getAppAPI() as PeerConnection<HalInspectorProtocol>;
  const [topology, setTopology] = createSignal<TopologySnapshot | null>(null);
  const [connected, setConnected] = createSignal(false);
  const [filter, setFilter] = createSignal("");
  const [category, setCategory] = createSignal<Category>("pins");
  const [selected, setSelected] = createSignal<Row | null>(null);
  const [watches, setWatches] = createSignal<HalItemRef[]>([]);
  const [values, setValues] = createSignal(new Map<string, HalValue>());
  const [activeTab, setActiveTab] = createSignal("browse");
  const [expandedGroups, setExpandedGroups] = createSignal(new Set<string>());
  const [treeOpen, setTreeOpen] = createSignal(false);
  const [drawerExpanded, setDrawerExpanded] = createSignal(false);
  const [scopeStatus, setScopeStatus] = createSignal<ScopeStatus | null>(null);
  const [capture, setCapture] = createSignal<ScopeCapture | null>(null);
  const [channels, setChannels] = createSignal<Array<HalItemRef | null>>(
    Array(16).fill(null)
  );
  const [intervalMs, setIntervalMs] = createSignal(100);
  const [scopeThread, setScopeThread] = createSignal("");
  const [scopeMultiplier, setScopeMultiplier] = createSignal(1);
  const [triggerMode, setTriggerMode] = createSignal<"auto" | "normal">("auto");
  const [triggerEdge, setTriggerEdge] = createSignal<"rising" | "falling">(
    "rising"
  );
  const [triggerLevel, setTriggerLevel] = createSignal(0);
  const [preTriggerRatio, setPreTriggerRatio] = createSignal(0.5);
  const [activeTriggerChannel, setActiveTriggerChannel] = createSignal(0);
  const [editRef, setEditRef] = createSignal<HalItemRef | null>(null);
  const [editValue, setEditValue] = createSignal("");
  const [error, setError] = createSignal("");
  const [preferencesLoaded, setPreferencesLoaded] = createSignal(false);
  let listElement!: HTMLDivElement;

  const itemRows = createMemo<Row[]>(() => {
    const data = topology();
    if (!data) return [];
    const rows: Row[] = [];
    if (category() === "components")
      rows.push(
        ...data.components.map((x) => ({
          id: `component:${x.id}`,
          name: x.name,
          kind: "components" as const,
          subtitle: `${x.kind} · ${x.ready ? "ready" : "not ready"}`,
        }))
      );
    if (category() === "pins")
      rows.push(
        ...data.pins.map((x) => ({
          id: `pin:${x.name}`,
          name: x.name,
          kind: "pins" as const,
          ref: { kind: "pin" as const, name: x.name },
          value: values().get(`pin:${x.name}`) ?? x.value,
          type: x.type,
          writable: x.direction !== "out" && !x.signalName,
          subtitle: `${x.direction}${x.signalName ? ` · ${x.signalName}` : ""}`,
        }))
      );
    if (category() === "params")
      rows.push(
        ...data.params.map((x) => ({
          id: `param:${x.name}`,
          name: x.name,
          kind: "params" as const,
          ref: { kind: "param" as const, name: x.name },
          value: values().get(`param:${x.name}`) ?? x.value,
          type: x.type,
          writable: x.direction === "rw",
          subtitle: x.direction,
        }))
      );
    if (category() === "signals")
      rows.push(
        ...data.signals.map((x) => ({
          id: `signal:${x.name}`,
          name: x.name,
          kind: "signals" as const,
          ref: { kind: "signal" as const, name: x.name },
          value: values().get(`signal:${x.name}`) ?? x.value,
          type: x.type,
          writable: x.writers === 0,
          subtitle: `${x.writers} writer · ${x.readers} reader`,
        }))
      );
    if (category() === "functions")
      rows.push(
        ...data.functions.map((x) => ({
          id: `function:${x.name}`,
          name: x.name,
          kind: "functions" as const,
          subtitle: `${x.ownerName} · ${x.users} user`,
        }))
      );
    if (category() === "threads")
      rows.push(
        ...data.threads.map((x) => ({
          id: `thread:${x.name}`,
          name: x.name,
          kind: "threads" as const,
          subtitle: `${(x.periodNs / 1e6).toFixed(3)} ms · ${
            x.functions.length
          } functions`,
        }))
      );
    const query = filter().trim().toLocaleLowerCase();
    return (
      query
        ? rows.filter((row) => row.name.toLocaleLowerCase().includes(query))
        : rows
    ).sort((a, b) => a.name.localeCompare(b.name));
  });
  const watchRows = createMemo(
    () =>
      watches()
        .map((ref) => itemRowsForRef(ref))
        .filter(Boolean) as Row[]
  );
  const sourceRows = createMemo(() =>
    activeTab() === "watch" ? watchRows() : itemRows()
  );
  const displayedRows = createMemo<TreeRow[]>(() => {
    const rows = sourceRows();
    if (activeTab() === "watch")
      return rows.map((row) => ({
        ...row,
        displayName: row.name,
        depth: 0,
        guideDepth: 0,
      }));
    return buildTreeRows(
      rows,
      `browse:${category()}`,
      expandedGroups(),
      filter().trim().length > 0
    );
  });
  const availableWatches = createMemo(() => {
    const data = topology();
    if (!data) return [];
    return watches().filter((ref) => {
      const items =
        ref.kind === "pin"
          ? data.pins
          : ref.kind === "param"
          ? data.params
          : data.signals;
      return items.some((item) => item.name === ref.name);
    });
  });
  const virtualizer = createVirtualizer({
    get count() {
      return displayedRows().length;
    },
    getScrollElement: () => listElement,
    estimateSize: () => 64,
    overscan: 8,
  });

  function itemRowsForRef(ref: HalItemRef): Row | null {
    const data = topology();
    if (!data)
      return {
        id: key(ref),
        name: ref.name,
        kind: ref.kind === "param" ? "params" : (`${ref.kind}s` as Category),
        ref,
        subtitle: t("inspector.unavailable"),
      };
    const meta =
      ref.kind === "pin"
        ? data.pins.find((x) => x.name === ref.name)
        : ref.kind === "param"
        ? data.params.find((x) => x.name === ref.name)
        : data.signals.find((x) => x.name === ref.name);
    if (!meta)
      return {
        id: key(ref),
        name: ref.name,
        kind: ref.kind === "param" ? "params" : (`${ref.kind}s` as Category),
        ref,
        subtitle: t("inspector.unavailable"),
      };
    const writable =
      ref.kind === "param"
        ? "direction" in meta && meta.direction === "rw"
        : ref.kind === "pin"
        ? "direction" in meta &&
          meta.direction !== "out" &&
          !("signalName" in meta && meta.signalName)
        : "writers" in meta && meta.writers === 0;
    return {
      id: key(ref),
      name: ref.name,
      kind: ref.kind === "param" ? "params" : (`${ref.kind}s` as Category),
      ref,
      type: meta.type,
      value: values().get(key(ref)) ?? meta.value,
      writable,
    };
  }

  const subscribedRefs = createMemo(
    () => {
      const visible = itemRows()
        .slice(0, 250)
        .flatMap((row) => (row.ref ? [row.ref] : []));
      return [
        ...new Map(
          [...availableWatches(), ...visible].map((ref) => [key(ref), ref])
        ).values(),
      ];
    },
    [],
    {
      equals: (previous, next) =>
        previous.length === next.length &&
        previous.every((ref, index) => key(ref) === key(next[index])),
    }
  );
  createEffect(
    () =>
      void api.request("subscriptions/set", {
        refs: subscribedRefs(),
        intervalMs: intervalMs(),
      })
  );
  createEffect(() =>
    api.send("ui/state", {
      visible: document.visibilityState === "visible",
      scopeExpanded: drawerExpanded(),
    })
  );

  async function loadPreferences() {
    try {
      const result = await window.edenAPI.shellCommand("db/get", {
        key: "hal-inspector.preferences.v1",
      });
      if (result.value) {
        const p = JSON.parse(result.value) as Preferences;
        if (p.version === 1) {
          setWatches(p.watches ?? []);
          setIntervalMs(p.intervalMs ?? 100);
          setDrawerExpanded(Boolean(p.drawerExpanded));
          setChannels((p.channels ?? Array(16).fill(null)).slice(0, 16));
          setScopeThread(p.threadName ?? "");
          setScopeMultiplier(Math.max(1, p.multiplier ?? 1));
          setTriggerMode(p.triggerMode ?? "auto");
          setTriggerEdge(p.triggerEdge ?? "rising");
          setTriggerLevel(p.triggerLevel ?? 0);
          setPreTriggerRatio(p.preTriggerRatio ?? 0.5);
        }
      }
    } catch {
      /* defaults */
    } finally {
      setPreferencesLoaded(true);
    }
  }
  async function savePreferences() {
    const value: Preferences = {
      ...DEFAULTS,
      watches: watches(),
      intervalMs: intervalMs(),
      drawerExpanded: drawerExpanded(),
      channels: channels(),
      threadName: scopeThread(),
      multiplier: scopeMultiplier(),
      triggerMode: triggerMode(),
      triggerEdge: triggerEdge(),
      triggerLevel: triggerLevel(),
      preTriggerRatio: preTriggerRatio(),
    };
    await window.edenAPI.shellCommand("db/set", {
      key: "hal-inspector.preferences.v1",
      value: JSON.stringify(value),
    });
  }
  createEffect(() => {
    watches();
    channels();
    drawerExpanded();
    intervalMs();
    scopeThread();
    scopeMultiplier();
    triggerMode();
    triggerEdge();
    triggerLevel();
    preTriggerRatio();
    if (preferencesLoaded()) void savePreferences();
  });

  function toggleWatch(ref: HalItemRef) {
    setWatches((current) =>
      current.some((x) => key(x) === key(ref))
        ? current.filter((x) => key(x) !== key(ref))
        : [...current, ref]
    );
  }
  function isWatched(ref: HalItemRef) {
    return watches().some((x) => key(x) === key(ref));
  }
  function toggleGroup(groupKey: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }
  async function refresh() {
    const result = await api.request("topology/refresh", {});
    if (result.ok) setTopology(result.value);
    else setError(result.error.message);
  }
  async function inspectOnScope(ref: HalItemRef) {
    const existing = channels().findIndex((x) => x && key(x) === key(ref));
    if (existing < 0) {
      const free = channels().findIndex((x) => !x);
      if (free < 0) {
        setError("All 16 scope channels are occupied.");
        return;
      }
      setChannels((current) =>
        current.map((value, index) => (index === free ? ref : value))
      );
    }
    setDrawerExpanded(true);
    await configureScope();
  }
  async function configureScope() {
    const thread =
      topology()?.threads.find((x) => x.name === scopeThread() && x.running) ??
      topology()?.threads.find((x) => x.name === "servo-thread") ??
      [...(topology()?.threads ?? [])]
        .filter((x) => x.running)
        .sort((a, b) => b.periodNs - a.periodNs)[0];
    if (!thread) {
      setError("No running realtime thread is available.");
      return;
    }
    const config: ScopeAcquisitionConfig = {
      threadName: thread.name,
      multiplier: scopeMultiplier(),
      preTrigger: Math.round(
        (scopeStatus()?.recordLength ?? 2000) * preTriggerRatio()
      ),
      triggerChannel:
        channels()[activeTriggerChannel()] != null
          ? activeTriggerChannel() + 1
          : channels().findIndex(Boolean) + 1,
      triggerLevel: triggerLevel(),
      rising: triggerEdge() === "rising",
      automatic: triggerMode() === "auto",
      channels: channels().map((ref) =>
        ref ? { ...ref, enabled: true } : null
      ),
    };
    const result = await api.request("scope/configure", config);
    if (result.ok) {
      setScopeThread(thread.name);
      setScopeStatus(result.value);
    } else setError(result.error.message);
  }
  function removeScopeChannel(index: number) {
    setChannels((current) =>
      current.map((value, currentIndex) =>
        currentIndex === index ? null : value
      )
    );
    queueMicrotask(() => void configureScope());
  }
  async function scopeAction(
    action: "single" | "continuous" | "stop" | "force"
  ) {
    const result =
      action === "stop"
        ? await api.request("scope/stop", {})
        : action === "force"
        ? await api.request("scope/force-trigger", {})
        : await api.request("scope/run", { mode: action });
    if (result.ok) setScopeStatus(result.value);
    else setError(result.error.message);
  }
  async function writeValue() {
    const ref = editRef();
    if (!ref) return;
    const result = await api.request("item/write", { ref, value: editValue() });
    if (!result.ok) setError(result.error.message);
    setEditRef(null);
  }

  onMount(async () => {
    await initLocale();
    await loadPreferences();
    api.on("connection/state", ({ connected }) => setConnected(connected));
    api.on("topology/changed", setTopology);
    api.on("values/delta", ({ values: deltas }) =>
      setValues((current) => {
        const next = new Map(current);
        deltas.forEach(({ ref, value }) => next.set(key(ref), value));
        return next;
      })
    );
    api.on("scope/status", setScopeStatus);
    api.on("scope/capture", ({ id, capture: next }) => {
      setCapture(next);
      requestAnimationFrame(() => api.send("scope/capture-ack", { id }));
    });
    api.on("error", ({ message }) => setError(message));
    const result = await api.request("bootstrap/get", {});
    if (result.ok) {
      setConnected(result.value.connected);
      setTopology(result.value.topology);
      setScopeStatus(result.value.scope);
    }
    const visibility = () =>
      api.send("ui/state", {
        visible: document.visibilityState === "visible",
        scopeExpanded: drawerExpanded(),
      });
    document.addEventListener("visibilitychange", visibility);
    onCleanup(() =>
      document.removeEventListener("visibilitychange", visibility)
    );
  });

  const sidebar = () => (
    <aside class="hal-sidebar eden-sidebar">
      <div class="sidebar-title">
        <strong>{t("inspector.appName")}</strong>
      </div>
      <nav aria-label={t("inspector.menu")}>
        <For each={Object.keys(categoryLabels) as Category[]}>
          {(item) => (
            <button
              class={`tree-root ${category() === item ? "active" : ""}`}
              onClick={() => {
                setCategory(item);
                setActiveTab("browse");
                setTreeOpen(false);
              }}
            >
              <span aria-hidden="true" class="category-icon">
                {item === "components" && <FaSolidCubes size={18} />}
                {item === "pins" && <FaSolidThumbTack size={18} />}
                {item === "params" && <FaSolidSliders size={18} />}
                {item === "signals" && <FaSolidWaveSquare size={18} />}
                {item === "functions" && <FaSolidCode size={18} />}
                {item === "threads" && <FaSolidClock size={18} />}
              </span>
              <span>{categoryLabels[item]()}</span>
              <span class="eden-badge eden-badge-sm">
                {item === "pins"
                  ? topology()?.pins.length
                  : item === "params"
                  ? topology()?.params.length
                  : item === "signals"
                  ? topology()?.signals.length
                  : item === "components"
                  ? topology()?.components.length
                  : item === "functions"
                  ? topology()?.functions.length
                  : topology()?.threads.length}
              </span>
            </button>
          )}
        </For>
      </nav>
    </aside>
  );

  return (
    <main class="inspector-frame">
      <Show
        when={connected()}
        fallback={
          <section class="disconnected-view">
            <strong>{t("inspector.appName")}</strong>
            <span>{t("inspector.disconnected")}</span>
          </section>
        }
      >
      <div class="desktop-tree">{sidebar()}</div>
      <Dialog.Root open={treeOpen()} onOpenChange={setTreeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay class="eden-modal-overlay" />
          <Dialog.Content class="mobile-tree eden-modal">
            {" "}
            <Dialog.Title class="sr-only">{t("inspector.menu")}</Dialog.Title>
            {sidebar()}
            <Dialog.CloseButton class="eden-btn eden-btn-ghost close-tree">
              <FaSolidXmark size={18} />
            </Dialog.CloseButton>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <section class="workspace">
        <Tabs.Root
          value={activeTab()}
          onChange={setActiveTab}
          class="content-tabs"
        >
          <div class="workspace-topbar">
          <header class="workspace-header">
          <button
            class="eden-btn eden-btn-ghost menu-button"
            onClick={() => setTreeOpen(true)}
          >
            <FaSolidBars size={18} />
            <span class="btn-label">{t("inspector.menu")}</span>
          </button>
          <div>
            <h1>{categoryLabels[category()]()}</h1>
            <span class="eden-text-sm eden-text-secondary">
              {sourceRows().length.toLocaleString()} items
            </span>
          </div>
          <label class="search">
            <span aria-hidden="true" class="search-icon">
              <FaSolidMagnifyingGlass size={18} />
            </span>
            <input
              class="eden-input"
              value={filter()}
              onInput={(event) => setFilter(event.currentTarget.value)}
              placeholder={t("inspector.search")}
            />
          </label>
          <button
            class="eden-btn eden-btn-outline"
            aria-label={t("inspector.refresh")}
            title={t("inspector.refresh")}
            onClick={refresh}
          >
            <FaSolidRotateRight size={18} />
          </button>
        </header>
          <div class="tabs-bar">
            <Tabs.List
              class="eden-tabs eden-tab-list eden-tab-list-pills"
              aria-label="HAL view"
            >
              <Tabs.Trigger
                class={`eden-tab eden-tab-pill ${
                  activeTab() === "browse" ? "eden-tab-active" : ""
                }`}
                value="browse"
              >
                {t("inspector.browse")}
              </Tabs.Trigger>
              <Tabs.Trigger
                class={`eden-tab eden-tab-pill ${
                  activeTab() === "watch" ? "eden-tab-active" : ""
                }`}
                value="watch"
              >
                {t("inspector.watch")}{" "}
                <span class="eden-badge eden-badge-sm">{watches().length}</span>
              </Tabs.Trigger>
            </Tabs.List>
            <Show when={activeTab() === "watch" && watches().length > 0}>
              <button
                class="eden-btn eden-btn-ghost clear-watches"
                onClick={() => setWatches([])}
              >
                <FaSolidXmark size={16} />
                {t("inspector.clearWatches")}
              </button>
            </Show>
          </div>
          </div>
          <div class="list-detail">
            <div
              ref={listElement}
              class="virtual-list eden-list"
              role="tree"
              aria-label={activeTab()}
            >
              <Show
                when={displayedRows().length}
                fallback={<div class="empty-state">{t("inspector.empty")}</div>}
              >
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    position: "relative",
                  }}
                >
                  <For each={virtualizer.getVirtualItems()}>
                    {(virtual) => {
                      const row = () => displayedRows()[virtual.index];
                      const groupExpanded = () =>
                        Boolean(
                          row()?.groupKey &&
                            (filter().trim() ||
                              expandedGroups().has(row()!.groupKey!))
                        );
                      return (
                        <article
                          class={`hal-row ${row()?.groupKey ? "group-row" : ""} ${
                            selected()?.id === row()?.id ? "selected" : ""
                          }`}
                          style={{
                            transform: `translateY(${virtual.start}px)`,
                          }}
                          role="treeitem"
                          aria-level={(row()?.depth ?? 0) + 1}
                          aria-expanded={
                            row()?.groupKey ? groupExpanded() : undefined
                          }
                          onClick={() => {
                            if (row()?.groupKey) toggleGroup(row()!.groupKey!);
                            else setSelected(row());
                          }}
                        >
                          <div
                            class="tree-leading"
                            style={{
                              "padding-left": `${(row()?.depth ?? 0) * 20}px`,
                              "--tree-guide-width": `${
                                (row()?.guideDepth ?? 0) * 20
                              }px`,
                            }}
                          >
                            <Show
                              when={row()?.groupKey}
                              fallback={
                                <div
                                  class="kind-chip"
                                  title={row()?.type ?? row()?.kind}
                                >
                                  <span
                                    class="type-dot"
                                    style={{
                                      "background-color":
                                        TYPE_COLORS[row()?.type ?? ""] ??
                                        TYPE_COLORS.default,
                                    }}
                                  />
                                </div>
                              }
                            >
                              <button
                                class="group-toggle"
                                aria-label={row()?.displayName}
                                tabindex={-1}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleGroup(row()!.groupKey!);
                                }}
                              >
                                {groupExpanded() ? (
                                  <FaSolidChevronDown size={14} />
                                ) : (
                                  <FaSolidChevronRight size={14} />
                                )}
                              </button>
                            </Show>
                          </div>
                          <div class="row-main">
                            <strong title={row()?.name}>{row()?.displayName}</strong>
                            <span>
                              {row()?.groupKey
                                ? `${row()?.groupCount ?? 0} items`
                                : row()?.subtitle}
                            </span>
                          </div>
                          <Show when={row()?.ref}>
                            <div class="value-cell">
                              <code class="value">
                                <span title={String(row()?.value ?? "—")}>
                                  {formatInlineValue(row()?.value)}
                                </span>
                              </code>
                              <span class="value-edit-slot">
                                <Show when={row()?.writable}>
                                  <button
                                    class="eden-btn eden-btn-outline"
                                    aria-label={t("inspector.edit")}
                                    title={t("inspector.edit")}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setEditRef(row()!.ref!);
                                      setEditValue(String(row()?.value ?? ""));
                                    }}
                                  >
                                    <FaSolidPenToSquare size={16} />
                                  </button>
                                </Show>
                              </span>
                            </div>
                            <div class="row-actions">
                              <button
                                class="eden-btn eden-btn-ghost"
                                aria-label={
                                  isWatched(row()!.ref!)
                                    ? t("inspector.removeWatch")
                                    : t("inspector.addWatch")
                                }
                                title={
                                  isWatched(row()!.ref!)
                                    ? t("inspector.removeWatch")
                                    : t("inspector.addWatch")
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleWatch(row()!.ref!);
                                }}
                              >
                                {isWatched(row()!.ref!) ? (
                                  <FaSolidMinus size={16} />
                                ) : (
                                  <FaSolidPlus size={16} />
                                )}
                              </button>
                              <Show
                                when={["bit", "float", "s32", "u32"].includes(
                                  row()?.type ?? ""
                                )}
                              >
                                <button
                                  class="eden-btn eden-btn-ghost"
                                  aria-label={t("inspector.inspectScope")}
                                  title={t("inspector.inspectScope")}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void inspectOnScope(row()!.ref!);
                                  }}
                                >
                                  <FaSolidChartLine size={16} />
                                </button>
                              </Show>
                            </div>
                          </Show>
                        </article>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
            <Show when={selected()}>
              <aside class="detail-pane eden-surface-secondary">
                <h2>{selected()!.name}</h2>
                <dl>
                  <dt>{t("inspector.type")}</dt>
                  <dd>{selected()!.type ?? selected()!.kind}</dd>
                  <dt>{t("inspector.value")}</dt>
                  <dd>
                    <code>{String(selected()!.value ?? "—")}</code>
                  </dd>
                </dl>
              </aside>
            </Show>
          </div>
        </Tabs.Root>
        <section class={`scope-drawer ${drawerExpanded() ? "expanded" : ""}`}>
          <header class="scope-bar">
            <button
              class="scope-title"
              onClick={() => setDrawerExpanded(!drawerExpanded())}
            >
              <span class="scope-wave">
                <FaSolidWaveSquare size={22} />
              </span>
              <strong>{t("inspector.scope")}</strong>
              <span
                class={`eden-badge eden-badge-sm ${
                  scopeStatus()?.state === "done" ? "eden-badge-success" : ""
                }`}
              >
                {scopeStatus()?.state ?? "idle"}
              </span>
            </button>
            <div class="scope-summary">
              <span>{scopeStatus()?.recordLength ?? 0} samples</span>
              <span>
                {scopeStatus()?.samplePeriodNs
                  ? `${(1e9 / scopeStatus()!.samplePeriodNs).toFixed(0)} Hz`
                  : "— Hz"}
              </span>
            </div>
            <button
              class="eden-btn eden-btn-ghost"
              onClick={() => setDrawerExpanded(!drawerExpanded())}
            >
              {drawerExpanded() ? (
                <>
                  <FaSolidChevronDown size={16} />
                  <span class="btn-label">{t("inspector.collapse")}</span>
                </>
              ) : (
                <>
                  <FaSolidChevronUp size={16} />
                  <span class="btn-label">{t("inspector.expand")}</span>
                </>
              )}
            </button>
          </header>
          <Show when={drawerExpanded()}>
            <div class="scope-body">
              <div class="scope-toolbar">
                <button
                  class="eden-btn eden-btn-primary"
                  onClick={() => scopeAction("continuous")}
                >
                  <FaSolidPlay size={16} />
                  <span class="btn-label">{t("inspector.continuous")}</span>
                </button>
                <button
                  class="eden-btn eden-btn-outline"
                  onClick={() => scopeAction("single")}
                >
                  <FaSolidCircleDot size={16} />
                  <span class="btn-label">{t("inspector.single")}</span>
                </button>
                <button
                  class="eden-btn eden-btn-outline"
                  onClick={() => scopeAction("stop")}
                >
                  <FaSolidSquare size={16} />
                  <span class="btn-label">{t("inspector.stop")}</span>
                </button>
                <button
                  class="eden-btn eden-btn-ghost"
                  onClick={() => scopeAction("force")}
                >
                  <FaSolidBolt size={16} />
                  <span class="btn-label">{t("inspector.force")}</span>
                </button>
                <label class="scope-field">
                  <span>{t("inspector.thread")}</span>
                  <select
                    class="eden-input"
                    value={scopeThread()}
                    onChange={(event) => {
                      setScopeThread(event.currentTarget.value);
                      void configureScope();
                    }}
                  >
                    <For
                      each={topology()?.threads.filter(
                        (thread) => thread.running
                      )}
                    >
                      {(thread) => (
                        <option value={thread.name}>{thread.name}</option>
                      )}
                    </For>
                  </select>
                </label>
                <label class="scope-field compact">
                  <span>{t("inspector.multiplier")}</span>
                  <input
                    class="eden-input"
                    type="number"
                    min="1"
                    max={Math.min(
                      1000,
                      Math.floor(
                        1e9 /
                          (topology()?.threads.find(
                            (thread) => thread.name === scopeThread()
                          )?.periodNs ?? 1e9)
                      )
                    )}
                    value={scopeMultiplier()}
                    onChange={(event) => {
                      setScopeMultiplier(event.currentTarget.valueAsNumber);
                      void configureScope();
                    }}
                  />
                </label>
              </div>
              <div class="trigger-toolbar" aria-label="Trigger controls">
                <div class="eden-btn-group">
                  <button
                    class={`eden-btn ${
                      triggerMode() === "auto"
                        ? "eden-btn-primary"
                        : "eden-btn-outline"
                    }`}
                    onClick={() => {
                      setTriggerMode("auto");
                      void configureScope();
                    }}
                  >
                    {t("inspector.auto")}
                  </button>
                  <button
                    class={`eden-btn ${
                      triggerMode() === "normal"
                        ? "eden-btn-primary"
                        : "eden-btn-outline"
                    }`}
                    onClick={() => {
                      setTriggerMode("normal");
                      void configureScope();
                    }}
                  >
                    {t("inspector.normal")}
                  </button>
                </div>
                <select
                  class="eden-input trigger-channel"
                  aria-label="Trigger channel"
                  value={activeTriggerChannel()}
                  onChange={(event) => {
                    setActiveTriggerChannel(Number(event.currentTarget.value));
                    void configureScope();
                  }}
                >
                  <For
                    each={channels()
                      .map((ref, index) => ({ ref, index }))
                      .filter(({ ref }) => ref)}
                  >
                    {({ ref, index }) => (
                      <option value={index}>
                        CH {index + 1} · {ref!.name}
                      </option>
                    )}
                  </For>
                </select>
                <select
                  class="eden-input trigger-edge"
                  value={triggerEdge()}
                  onChange={(event) => {
                    setTriggerEdge(
                      event.currentTarget.value as "rising" | "falling"
                    );
                    void configureScope();
                  }}
                >
                  <option value="rising">{t("inspector.rising")}</option>
                  <option value="falling">{t("inspector.falling")}</option>
                </select>
                <label class="scope-field compact">
                  <span>Level</span>
                  <input
                    class="eden-input"
                    type="number"
                    step="any"
                    value={triggerLevel()}
                    onChange={(event) => {
                      setTriggerLevel(event.currentTarget.valueAsNumber);
                      void configureScope();
                    }}
                  />
                </label>
                <label class="pre-trigger">
                  <span>
                    Pre-trigger {Math.round(preTriggerRatio() * 100)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="0.9"
                    step="0.05"
                    value={preTriggerRatio()}
                    onChange={(event) => {
                      setPreTriggerRatio(event.currentTarget.valueAsNumber);
                      void configureScope();
                    }}
                  />
                </label>
              </div>
              <div class="plot-area">
                <ScopePlot
                  capture={capture()}
                  names={channels().map((ref) => ref?.name ?? null)}
                  types={channels().map((ref) =>
                    ref ? itemRowsForRef(ref)?.type ?? null : null
                  )}
                />
                <Show when={!channels().some(Boolean)}>
                  <div class="plot-empty">{t("inspector.noChannels")}</div>
                </Show>
              </div>
              <div class="channel-strip">
                <For
                  each={channels()
                    .map((ref, index) => ({ ref, index }))
                    .filter(({ ref }) => ref)}
                >
                  {({ ref, index }) => (
                    <span class="eden-tag">
                      CH {index + 1} · {ref!.name}
                      <button
                        aria-label="Remove channel"
                        onClick={() => removeScopeChannel(index)}
                      >
                        <FaSolidXmark size={14} />
                      </button>
                    </span>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </section>
      </section>
      <Dialog.Root
        open={Boolean(editRef())}
        onOpenChange={(open) => !open && setEditRef(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay class="eden-modal-overlay" />
          <Dialog.Content class="edit-dialog eden-modal">
            <Dialog.Title class="eden-modal-title">
              {t("inspector.edit")}
            </Dialog.Title>
            <Dialog.Description class="eden-text-secondary">
              {editRef()?.name}
            </Dialog.Description>
            <label>
              {t("inspector.current")}
              <output>
                {String(editRef() ? values().get(key(editRef()!)) ?? "—" : "")}
              </output>
            </label>
            <label>
              {t("inspector.proposed")}
              <input
                class="eden-input"
                value={editValue()}
                onInput={(event) => setEditValue(event.currentTarget.value)}
                autofocus
              />
            </label>
            <div class="dialog-actions">
              <Dialog.CloseButton class="eden-btn eden-btn-outline">
                {t("inspector.cancel")}
              </Dialog.CloseButton>
              <button class="eden-btn eden-btn-primary" onClick={writeValue}>
                {t("inspector.write")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Show when={error()}>
        <div class="error-toast eden-card" role="alert">
          <span>{error()}</span>
          <button class="eden-btn eden-btn-ghost" onClick={() => setError("")}>
            <FaSolidXmark size={18} />
          </button>
        </div>
      </Show>
      </Show>
    </main>
  );
};
export default App;
