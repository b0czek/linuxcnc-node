import type { PeerConnection } from "@edenapp/types/ipc";
import * as Dialog from "@kobalte/core/dialog";
import type {
  HalItemRef,
  HalValue,
  ScopeAcquisitionConfig,
  ScopeCapture,
  ScopeStatus,
} from "@linuxcnc-node/types";
import { createVirtualizer } from "@tanstack/solid-virtual";
import {
  FaSolidBars,
  FaSolidBolt,
  FaSolidChartLine,
  FaSolidChevronDown,
  FaSolidChevronRight,
  FaSolidCircleDot,
  FaSolidMinus,
  FaSolidPenToSquare,
  FaSolidPlay,
  FaSolidPlus,
  FaSolidSquare,
  FaSolidWaveSquare,
  FaSolidXmark,
} from "solid-icons/fa";
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type {
  HalInspectorProtocol,
  ScopeRollFrame,
  ScopeRunMode,
  TopologySnapshot,
} from "../../shared/protocol";
import { BrowseHeader } from "./BrowseHeader";
import { InspectorSidebar } from "./InspectorSidebar";
import { initLocale, t } from "./i18n";
import {
  type ActiveTab,
  type Category,
  DEFAULT_PREFERENCES as DEFAULTS,
  defaultScopeDisplays,
  type Preferences,
  type Row,
  type ScopeChannelDisplay,
  type TreeRow,
} from "./models";
import { ScopePlot } from "./ScopePlot";
import { buildTreeRows, formatInlineValue, TYPE_COLORS } from "./tree";

const key = (ref: HalItemRef) => `${ref.kind}:${ref.name}`;
const LIST_ROW_PITCH = 64;
const LIST_OVERSCAN = 8;

export const HalInspector: Component = () => {
  const api = window.getAppAPI() as PeerConnection<HalInspectorProtocol>;
  const [topology, setTopology] = createSignal<TopologySnapshot | null>(null);
  const [connected, setConnected] = createSignal(false);
  const [filter, setFilter] = createSignal("");
  const [category, setCategory] = createSignal<Category>("pins");
  const [selected, setSelected] = createSignal<Row | null>(null);
  const [watches, setWatches] = createSignal<HalItemRef[]>([]);
  const [values, setValues] = createSignal(new Map<string, HalValue>());
  const [activeTab, setActiveTab] = createSignal<ActiveTab>("browse");
  const [expandedGroups, setExpandedGroups] = createSignal(new Set<string>());
  const [treeOpen, setTreeOpen] = createSignal(false);
  const [scopeStatus, setScopeStatus] = createSignal<ScopeStatus | null>(null);
  const [scopeRunMode, setScopeRunMode] = createSignal<ScopeRunMode>("stop");
  const [scopeConfigured, setScopeConfigured] = createSignal(false);
  const [capture, setCapture] = createSignal<ScopeCapture | null>(null);
  const [rollFrame, setRollFrame] = createSignal<ScopeRollFrame | null>(null);
  const [channels, setChannels] = createSignal<Array<HalItemRef | null>>(
    Array(16).fill(null),
  );
  const [intervalMs, setIntervalMs] = createSignal(100);
  const [scopeThread, setScopeThread] = createSignal("");
  const [scopeMultiplier, setScopeMultiplier] = createSignal(1);
  const [triggerMode, setTriggerMode] = createSignal<"auto" | "normal">("auto");
  const [triggerEdge, setTriggerEdge] = createSignal<"rising" | "falling">(
    "rising",
  );
  const [triggerLevel, setTriggerLevel] = createSignal(0);
  const [preTriggerRatio, setPreTriggerRatio] = createSignal(0.5);
  const [activeTriggerChannel, setActiveTriggerChannel] = createSignal(0);
  const [scopeDisplays, setScopeDisplays] = createSignal(
    defaultScopeDisplays(),
  );
  const [activeScopeChannel, setActiveScopeChannel] = createSignal(0);
  const [skippedCaptures, setSkippedCaptures] = createSignal(0);
  const [editRef, setEditRef] = createSignal<HalItemRef | null>(null);
  const [editValue, setEditValue] = createSignal("");
  const [error, setError] = createSignal("");
  const [preferencesLoaded, setPreferencesLoaded] = createSignal(false);
  let preferenceSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let listElement: HTMLDivElement | null = null;

  const categoryCount = (item: Category) => {
    const data = topology();
    if (!data) return 0;
    if (item === "params") return data.params.length;
    return data[item].length;
  };

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
        })),
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
        })),
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
        })),
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
        })),
      );
    if (category() === "functions")
      rows.push(
        ...data.functions.map((x) => ({
          id: `function:${x.name}`,
          name: x.name,
          kind: "functions" as const,
          subtitle: `${x.ownerName} · ${x.users} user`,
        })),
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
        })),
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
        .filter(Boolean) as Row[],
  );
  const sourceRows = createMemo(() =>
    activeTab() === "watch" ? watchRows() : itemRows(),
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
      filter().trim().length > 0,
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
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return displayedRows().length;
    },
    getScrollElement: () => listElement,
    estimateSize: () => LIST_ROW_PITCH,
    overscan: LIST_OVERSCAN,
  });
  const attachListElement = (element: HTMLDivElement) => {
    listElement = element;
    // The list is mounted only after the backend connects, which can happen
    // after the Solid virtualizer's onMount hook has already run. Waiting for
    // the next frame also lets Solid move template nodes into the live document
    // before TanStack captures ownerDocument.defaultView for its observers.
    requestAnimationFrame(() => {
      if (!disposed && listElement === element) virtualizer._willUpdate();
    });
  };

  createEffect(() => {
    category();
    filter();
    activeTab();
    const element = listElement;
    if (!element || activeTab() === "scope") return;
    element.scrollTop = 0;
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
          [...availableWatches(), ...visible].map((ref) => [key(ref), ref]),
        ).values(),
      ];
    },
    [],
    {
      equals: (previous, next) =>
        previous.length === next.length &&
        previous.every((ref, index) => key(ref) === key(next[index])),
    },
  );
  createEffect(
    () =>
      void api.request("subscriptions/set", {
        refs: subscribedRefs(),
        intervalMs: intervalMs(),
      }),
  );
  createEffect(() =>
    api.send("ui/state", {
      visible: document.visibilityState === "visible",
      scopeExpanded: activeTab() === "scope",
    }),
  );

  async function loadPreferences() {
    try {
      const current = await window.edenAPI.shellCommand("db/get", {
        key: "hal-inspector.preferences.v2",
      });
      const legacy = current.value
        ? null
        : await window.edenAPI.shellCommand("db/get", {
            key: "hal-inspector.preferences.v1",
          });
      const stored = current.value ?? legacy?.value;
      if (stored) {
        const p = JSON.parse(stored) as Omit<
          Partial<Preferences>,
          "version"
        > & {
          version?: number;
        };
        if (p.version === 1 || p.version === 2) {
          setWatches(p.watches ?? []);
          setIntervalMs(p.intervalMs ?? 100);
          if (p.drawerExpanded) setActiveTab("scope");
          const storedChannels = p.channels ?? [];
          setChannels(
            Array.from(
              { length: 16 },
              (_, index) => storedChannels[index] ?? null,
            ),
          );
          setScopeThread(p.threadName ?? "");
          setScopeMultiplier(Math.max(1, p.multiplier ?? 1));
          setTriggerMode(p.triggerMode ?? "auto");
          setActiveTriggerChannel(
            Math.max(0, Math.min(15, p.triggerChannel ?? 0)),
          );
          setTriggerEdge(p.triggerEdge ?? "rising");
          setTriggerLevel(p.triggerLevel ?? 0);
          setPreTriggerRatio(p.preTriggerRatio ?? 0.5);
          const storedDisplays = p.scopeDisplays ?? [];
          setScopeDisplays(
            Array.from({ length: 16 }, (_, index) => {
              const display = storedDisplays[index];
              return {
                unitsPerDivision:
                  display?.unitsPerDivision &&
                  Number.isFinite(display.unitsPerDivision) &&
                  display.unitsPerDivision > 0
                    ? display.unitsPerDivision
                    : 1,
                offset: Number.isFinite(display?.offset)
                  ? Number(display?.offset)
                  : 0,
              };
            }),
          );
          setActiveScopeChannel(
            Math.max(0, Math.min(15, p.activeScopeChannel ?? 0)),
          );
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
      drawerExpanded: activeTab() === "scope",
      channels: channels(),
      threadName: scopeThread(),
      multiplier: scopeMultiplier(),
      triggerMode: triggerMode(),
      triggerChannel: activeTriggerChannel(),
      triggerEdge: triggerEdge(),
      triggerLevel: triggerLevel(),
      preTriggerRatio: preTriggerRatio(),
      scopeDisplays: scopeDisplays(),
      activeScopeChannel: activeScopeChannel(),
    };
    await window.edenAPI.shellCommand("db/set", {
      key: "hal-inspector.preferences.v2",
      value: JSON.stringify(value),
    });
  }
  createEffect(() => {
    watches();
    channels();
    activeTab();
    intervalMs();
    scopeThread();
    scopeMultiplier();
    triggerMode();
    activeTriggerChannel();
    triggerEdge();
    triggerLevel();
    preTriggerRatio();
    scopeDisplays().forEach((display) => {
      display.unitsPerDivision;
      display.offset;
    });
    activeScopeChannel();
    if (preferencesLoaded()) {
      clearTimeout(preferenceSaveTimer);
      preferenceSaveTimer = setTimeout(() => void savePreferences(), 180);
    }
  });

  function toggleWatch(ref: HalItemRef) {
    setWatches((current) =>
      current.some((x) => key(x) === key(ref))
        ? current.filter((x) => key(x) !== key(ref))
        : [...current, ref],
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
        current.map((value, index) => (index === free ? ref : value)),
      );
      setActiveScopeChannel(free);
    } else setActiveScopeChannel(existing);
    setActiveTab("scope");
    await configureScope();
  }
  async function configureScope(): Promise<boolean> {
    setScopeConfigured(false);
    if (scopeRunMode() === "roll") {
      setCapture(null);
      setSkippedCaptures(0);
    }
    const thread =
      topology()?.threads.find((x) => x.name === scopeThread() && x.running) ??
      topology()?.threads.find((x) => x.name === "servo-thread") ??
      [...(topology()?.threads ?? [])]
        .filter((x) => x.running)
        .sort((a, b) => b.periodNs - a.periodNs)[0];
    if (!thread) {
      setError("No running realtime thread is available.");
      return false;
    }
    const config: ScopeAcquisitionConfig = {
      threadName: thread.name,
      multiplier: scopeMultiplier(),
      preTrigger: Math.round(
        (scopeStatus()?.recordLength ?? 2000) * preTriggerRatio(),
      ),
      triggerChannel:
        channels()[activeTriggerChannel()] != null
          ? activeTriggerChannel() + 1
          : channels().findIndex(Boolean) + 1,
      triggerLevel: triggerLevel(),
      rising: triggerEdge() === "rising",
      automatic: triggerMode() === "auto",
      channels: channels().map((ref, index) =>
        ref ? { ...ref, index, enabled: true } : null,
      ),
    };
    const result = await api.request("scope/configure", config);
    if (result.ok) {
      setScopeThread(thread.name);
      setScopeStatus(result.value);
      setScopeConfigured(true);
      return true;
    }
    setScopeConfigured(false);
    setError(result.error.message);
    return false;
  }
  function removeScopeChannel(index: number) {
    const next = channels().map((value, currentIndex) =>
      currentIndex === index ? null : value,
    );
    setChannels(next);
    if (activeScopeChannel() === index)
      setActiveScopeChannel(Math.max(0, next.findIndex(Boolean)));
    if (activeTriggerChannel() === index)
      setActiveTriggerChannel(Math.max(0, next.findIndex(Boolean)));
    queueMicrotask(() => void configureScope());
  }
  function updateScopeDisplay(index: number, display: ScopeChannelDisplay) {
    setScopeDisplays((current) =>
      current.map((value, currentIndex) =>
        currentIndex === index ? display : value,
      ),
    );
  }
  async function scopeAction(
    action: "run" | "roll" | "single" | "stop" | "force",
  ) {
    if (
      action !== "stop" &&
      action !== "force" &&
      !scopeConfigured() &&
      !(await configureScope())
    )
      return;
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
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    applyValueUpdates([{ ref, value: result.value.value }]);
    setEditRef(null);
  }

  function applyValueUpdates(
    updates: Array<{ ref: HalItemRef; value: HalValue }>,
  ) {
    setValues((current) => {
      const next = new Map(current);
      updates.forEach(({ ref, value }) => {
        next.set(key(ref), value);
      });
      return next;
    });
    setSelected((current) => {
      if (!current?.ref) return current;
      const update = updates.find(({ ref }) => key(ref) === key(current.ref!));
      return update ? { ...current, value: update.value } : current;
    });
  }

  const handleConnectionState = ({ connected }: { connected: boolean }) =>
    setConnected(connected);
  const handleTopologyChanged = (next: TopologySnapshot) => setTopology(next);
  const handleValuesDelta = ({
    values: deltas,
  }: HalInspectorProtocol["hostMessages"]["values/delta"]) =>
    applyValueUpdates(deltas);
  const handleScopeStatus = (next: ScopeStatus) => setScopeStatus(next);
  const handleScopeRunMode = ({ mode }: { mode: ScopeRunMode }) => {
    if ((scopeRunMode() === "roll") !== (mode === "roll")) {
      setCapture(null);
      setRollFrame(null);
      setSkippedCaptures(0);
    }
    setScopeRunMode(mode);
  };
  const handleScopeRollBatch = ({
    id,
    generation,
    batch,
    skipped,
  }: HalInspectorProtocol["hostMessages"]["scope/roll-batch"]) => {
    setRollFrame({ generation, batch });
    setSkippedCaptures(skipped);
    requestAnimationFrame(() => api.send("scope/capture-ack", { id }));
  };
  const handleScopeCapture = ({
    id,
    capture: next,
    skipped,
  }: HalInspectorProtocol["hostMessages"]["scope/capture"]) => {
    setCapture(next);
    setSkippedCaptures(skipped);
    requestAnimationFrame(() => api.send("scope/capture-ack", { id }));
  };
  const handleApiError = ({ message }: { message: string }) =>
    setError(message);
  const handleVisibilityChange = () =>
    api.send("ui/state", {
      visible: document.visibilityState === "visible",
      scopeExpanded: activeTab() === "scope",
    });

  onMount(() => {
    disposed = false;
    api.on("connection/state", handleConnectionState);
    api.on("topology/changed", handleTopologyChanged);
    api.on("values/delta", handleValuesDelta);
    api.on("scope/status", handleScopeStatus);
    api.on("scope/run-mode", handleScopeRunMode);
    api.on("scope/capture", handleScopeCapture);
    api.on("scope/roll-batch", handleScopeRollBatch);
    api.on("error", handleApiError);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void (async () => {
      await initLocale();
      if (disposed) return;
      await loadPreferences();
      if (disposed) return;
      const result = await api.request("bootstrap/get", {});
      if (disposed) return;
      if (result.ok) {
        setConnected(result.value.connected);
        setTopology(result.value.topology);
        setScopeStatus(result.value.scope);
        setScopeRunMode(result.value.scopeRunMode);
        if (channels().some(Boolean)) await configureScope();
      }
    })();
  });

  onCleanup(() => {
    disposed = true;
    api.off("connection/state", handleConnectionState);
    api.off("topology/changed", handleTopologyChanged);
    api.off("values/delta", handleValuesDelta);
    api.off("scope/status", handleScopeStatus);
    api.off("scope/run-mode", handleScopeRunMode);
    api.off("scope/capture", handleScopeCapture);
    api.off("scope/roll-batch", handleScopeRollBatch);
    api.off("error", handleApiError);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    listElement = null;
    clearTimeout(preferenceSaveTimer);
  });

  const sidebar = () => (
    <InspectorSidebar
      activeTab={activeTab()}
      watchCount={watches().length}
      scopeStatus={scopeStatus()}
      onSelect={(tab) => {
        setActiveTab(tab);
        setTreeOpen(false);
      }}
    />
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
          <Show when={activeTab() !== "browse"}>
            <button
              type="button"
              class="eden-btn eden-btn-ghost menu-button standalone-menu-button"
              aria-label={t("inspector.menu")}
              title={t("inspector.menu")}
              onClick={() => setTreeOpen(true)}
            >
              <FaSolidBars size={18} />
            </button>
          </Show>
          <div
            class={`workspace-content ${
              activeTab() !== "browse" ? "has-standalone-menu" : ""
            }`}
          >
            <Show when={activeTab() === "browse"}>
              <BrowseHeader
                category={category()}
                itemCount={sourceRows().length}
                filter={filter()}
                categoryCount={categoryCount}
                onCategoryChange={setCategory}
                onFilterChange={setFilter}
                onMenuOpen={() => setTreeOpen(true)}
                onRefresh={() => void refresh()}
              />
            </Show>
            <Show when={activeTab() !== "scope"}>
              <div class="list-detail">
                <Show when={activeTab() === "watch" && watches().length > 0}>
                  <button
                    type="button"
                    class="eden-btn eden-btn-sm eden-btn-ghost clear-watches"
                    aria-label={t("inspector.clearWatches")}
                    title={t("inspector.clearWatches")}
                    onClick={() => setWatches([])}
                  >
                    <FaSolidXmark size={16} />
                  </button>
                </Show>
                <div
                  ref={attachListElement}
                  class={`virtual-list eden-list ${activeTab() === "watch" ? "watch-list" : ""}`}
                  role="tree"
                  aria-label={activeTab()}
                >
                  <Show
                    when={displayedRows().length}
                    fallback={
                      <div class="empty-state">{t("inspector.empty")}</div>
                    }
                  >
                    <div
                      style={{
                        height: `${virtualizer.getTotalSize()}px`,
                        position: "relative",
                      }}
                    >
                      <For each={virtualizer.getVirtualItems()}>
                        {(virtualRow) => {
                          const row = () => displayedRows()[virtualRow.index];
                          const groupExpanded = () =>
                            Boolean(
                              row()?.groupKey &&
                                (filter().trim() ||
                                  expandedGroups().has(row()!.groupKey!)),
                            );
                          return (
                            <div
                              class={`hal-row ${row()?.groupKey ? "group-row" : ""} ${
                                selected()?.id === row()?.id ? "selected" : ""
                              }`}
                              style={{
                                transform: `translateY(${virtualRow.start}px)`,
                              }}
                              role="treeitem"
                              tabIndex={0}
                              aria-level={(row()?.depth ?? 0) + 1}
                              aria-expanded={
                                row()?.groupKey ? groupExpanded() : undefined
                              }
                              onClick={() => {
                                if (row()?.groupKey)
                                  toggleGroup(row()!.groupKey!);
                                else setSelected(row());
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ")
                                  return;
                                event.preventDefault();
                                if (row()?.groupKey)
                                  toggleGroup(row()!.groupKey!);
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
                                    type="button"
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
                                <strong title={row()?.name}>
                                  {row()?.displayName}
                                </strong>
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
                                        type="button"
                                        class="eden-btn eden-btn-outline"
                                        aria-label={t("inspector.edit")}
                                        title={t("inspector.edit")}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setEditRef(row()!.ref!);
                                          setEditValue(
                                            String(row()?.value ?? ""),
                                          );
                                        }}
                                      >
                                        <FaSolidPenToSquare size={16} />
                                      </button>
                                    </Show>
                                  </span>
                                </div>
                                <div class="row-actions">
                                  <button
                                    type="button"
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
                                    when={[
                                      "bit",
                                      "float",
                                      "s32",
                                      "u32",
                                    ].includes(row()?.type ?? "")}
                                  >
                                    <button
                                      type="button"
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
                            </div>
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
            </Show>
            <Show when={activeTab() === "scope"}>
              <section class="scope-panel">
                <div class="scope-body">
                  <div class="scope-toolbar">
                    <div class="scope-actions">
                      <button
                        type="button"
                        class={`eden-btn eden-btn-sm ${
                          scopeRunMode() === "run"
                            ? "eden-btn-primary"
                            : "eden-btn-outline"
                        }`}
                        disabled={!channels().some(Boolean)}
                        onClick={() => scopeAction("run")}
                      >
                        <FaSolidPlay size={16} />
                        <span class="btn-label">{t("inspector.run")}</span>
                      </button>
                      <button
                        type="button"
                        class={`eden-btn eden-btn-sm ${
                          scopeRunMode() === "roll"
                            ? "eden-btn-primary"
                            : "eden-btn-outline"
                        }`}
                        disabled={!channels().some(Boolean)}
                        onClick={() => scopeAction("roll")}
                      >
                        <FaSolidWaveSquare size={16} />
                        <span class="btn-label">{t("inspector.roll")}</span>
                      </button>
                      <button
                        type="button"
                        class={`eden-btn eden-btn-sm ${
                          scopeRunMode() === "single"
                            ? "eden-btn-primary"
                            : "eden-btn-outline"
                        }`}
                        disabled={!channels().some(Boolean)}
                        onClick={() => scopeAction("single")}
                      >
                        <FaSolidCircleDot size={16} />
                        <span class="btn-label">{t("inspector.single")}</span>
                      </button>
                      <button
                        type="button"
                        class="eden-btn eden-btn-sm eden-btn-outline"
                        disabled={scopeRunMode() === "stop"}
                        onClick={() => scopeAction("stop")}
                      >
                        <FaSolidSquare size={16} />
                        <span class="btn-label">{t("inspector.stop")}</span>
                      </button>
                      <button
                        type="button"
                        class="eden-btn eden-btn-sm eden-btn-ghost"
                        disabled={scopeRunMode() === "roll"}
                        onClick={() => scopeAction("force")}
                      >
                        <FaSolidBolt size={16} />
                        <span class="btn-label">{t("inspector.force")}</span>
                      </button>
                    </div>
                    <div class="scope-acquisition">
                      <label class="scope-field">
                        <span>{t("inspector.thread")}</span>
                        <select
                          class="eden-input eden-input-sm"
                          value={scopeThread()}
                          onChange={(event) => {
                            setScopeThread(event.currentTarget.value);
                            void configureScope();
                          }}
                        >
                          <For
                            each={topology()?.threads.filter(
                              (thread) => thread.running,
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
                          class="eden-input eden-input-sm"
                          type="number"
                          min="1"
                          max={Math.min(
                            1000,
                            Math.floor(
                              1e9 /
                                (topology()?.threads.find(
                                  (thread) => thread.name === scopeThread(),
                                )?.periodNs ?? 1e9),
                            ),
                          )}
                          value={scopeMultiplier()}
                          onChange={(event) => {
                            setScopeMultiplier(
                              event.currentTarget.valueAsNumber,
                            );
                            void configureScope();
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <fieldset
                    class="trigger-toolbar"
                    classList={{ "roll-disabled": scopeRunMode() === "roll" }}
                    aria-label="Trigger controls"
                    disabled={scopeRunMode() === "roll"}
                  >
                    <div class="eden-btn-group">
                      <button
                        type="button"
                        class={`eden-btn eden-btn-sm ${
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
                        type="button"
                        class={`eden-btn eden-btn-sm ${
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
                      class="eden-input eden-input-sm trigger-channel"
                      aria-label="Trigger channel"
                      value={activeTriggerChannel()}
                      onChange={(event) => {
                        setActiveTriggerChannel(
                          Number(event.currentTarget.value),
                        );
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
                      class="eden-input eden-input-sm trigger-edge"
                      value={triggerEdge()}
                      onChange={(event) => {
                        setTriggerEdge(
                          event.currentTarget.value as "rising" | "falling",
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
                        class="eden-input eden-input-sm"
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
                  </fieldset>
                  <div class="plot-area">
                    <ScopePlot
                      capture={capture()}
                      rollFrame={rollFrame()}
                      runMode={scopeRunMode()}
                      names={channels().map((ref) => ref?.name ?? null)}
                      types={channels().map((ref) => {
                        const data = topology();
                        if (!ref || !data) return null;
                        const items =
                          ref.kind === "pin"
                            ? data.pins
                            : ref.kind === "param"
                              ? data.params
                              : data.signals;
                        return (
                          items.find((item) => item.name === ref.name)?.type ??
                          null
                        );
                      })}
                      displays={scopeDisplays()}
                      activeChannel={activeScopeChannel()}
                      triggerChannel={
                        channels()[activeTriggerChannel()]
                          ? activeTriggerChannel()
                          : Math.max(0, channels().findIndex(Boolean))
                      }
                      triggerLevel={triggerLevel()}
                      status={scopeStatus()}
                      skippedCaptures={skippedCaptures()}
                      onActiveChannelChange={setActiveScopeChannel}
                      onDisplayChange={updateScopeDisplay}
                      onTriggerLevelCommit={(value) => {
                        setTriggerLevel(value);
                        queueMicrotask(() => void configureScope());
                      }}
                      onRemoveChannel={removeScopeChannel}
                    />
                    <Show when={!channels().some(Boolean)}>
                      <div class="plot-empty">{t("inspector.noChannels")}</div>
                    </Show>
                  </div>
                </div>
              </section>
            </Show>
          </div>
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
                  {String(
                    editRef() ? (values().get(key(editRef()!)) ?? "—") : "",
                  )}
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
                <button
                  type="button"
                  class="eden-btn eden-btn-primary"
                  onClick={writeValue}
                >
                  {t("inspector.write")}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Show when={error()}>
          <div class="error-toast eden-card" role="alert">
            <span>{error()}</span>
            <button
              type="button"
              class="eden-btn eden-btn-ghost"
              onClick={() => setError("")}
            >
              <FaSolidXmark size={18} />
            </button>
          </div>
        </Show>
      </Show>
    </main>
  );
};
