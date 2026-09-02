import type { PeerConnection } from "@edenapp/types/ipc";
import type {
  HalItemRef,
  HalValue,
  ScopeAcquisitionConfig,
  ScopeCapture,
  ScopeStatus,
} from "@linuxcnc-node/types";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type ParentComponent,
  useContext,
} from "solid-js";
import type {
  HalInspectorProtocol,
  ScopeRollFrame,
  ScopeRunMode,
  TopologySnapshot,
} from "../../shared/protocol";
import {
  buildItemRows,
  categoryItemCount,
  halItemKey as key,
  rowForRef,
} from "./hal-items";
import { initLocale } from "./i18n";
import {
  type ActiveTab,
  type Category,
  defaultScopeDisplays,
  type Preferences,
  type Row,
  type ScopeChannelDisplay,
  type TreeRow,
} from "./models";
import {
  savePreferences as persistPreferences,
  loadPreferences as readPreferences,
} from "./preferences";
import { buildTreeRows } from "./tree";
import { useHalTelemetry } from "./useHalTelemetry";

function createHalInspectorController() {
  const api = window.getAppAPI() as PeerConnection<HalInspectorProtocol>;
  const [topology, setTopology] = createSignal<TopologySnapshot | null>(null);
  const [connected, setConnected] = createSignal(false);
  const [filter, setFilter] = createSignal("");
  const [category, setCategory] = createSignal<Category>("pins");
  const [selected, setSelected] = createSignal<Row | null>(null);
  const [watches, setWatches] = createSignal<HalItemRef[]>([]);
  const [values, setValues] = createSignal(new Map<string, HalValue>());
  const [unavailableValues, setUnavailableValues] = createSignal(
    new Set<string>(),
  );
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
  const [pageVisible, setPageVisible] = createSignal(
    document.visibilityState === "visible",
  );
  const [preferencesLoaded, setPreferencesLoaded] = createSignal(false);
  let preferenceSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const categoryCount = (item: Category) => categoryItemCount(topology(), item);

  const itemRows = createMemo<Row[]>(() =>
    buildItemRows(
      topology(),
      category(),
      filter(),
      values(),
      unavailableValues(),
    ),
  );
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
  function itemRowsForRef(ref: HalItemRef): Row | null {
    return rowForRef(ref, topology(), values(), unavailableValues());
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
  useHalTelemetry({
    api,
    topology,
    refs: subscribedRefs,
    intervalMs,
    pageVisible,
    setValues,
    setUnavailableValues,
    onUpdates: (updates) =>
      setSelected((current) => {
        const currentRef = current?.ref;
        if (!currentRef) return current;
        const update = updates.find(({ ref }) => key(ref) === key(currentRef));
        return update ? { ...current, value: update.value } : current;
      }),
    onError: setError,
  });
  createEffect(() =>
    api.send("ui/state", {
      visible: document.visibilityState === "visible",
      scopeExpanded: activeTab() === "scope",
    }),
  );

  async function restorePreferences() {
    const preferences = await readPreferences();
    setWatches(preferences.watches);
    setIntervalMs(preferences.intervalMs);
    if (preferences.drawerExpanded) setActiveTab("scope");
    setChannels(preferences.channels);
    setScopeThread(preferences.threadName ?? "");
    setScopeMultiplier(preferences.multiplier);
    setTriggerMode(preferences.triggerMode);
    setActiveTriggerChannel(preferences.triggerChannel);
    setTriggerEdge(preferences.triggerEdge);
    setTriggerLevel(preferences.triggerLevel);
    setPreTriggerRatio(preferences.preTriggerRatio);
    setScopeDisplays(preferences.scopeDisplays);
    setActiveScopeChannel(preferences.activeScopeChannel);
    setPreferencesLoaded(true);
  }
  async function savePreferences() {
    const value: Preferences = {
      version: 2,
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
    await persistPreferences(value);
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
      const currentRef = current?.ref;
      if (!currentRef) return current;
      const update = updates.find(({ ref }) => key(ref) === key(currentRef));
      return update ? { ...current, value: update.value } : current;
    });
  }

  const handleConnectionState = ({ connected }: { connected: boolean }) =>
    setConnected(connected);
  const handleTopologyChanged = (next: TopologySnapshot) => setTopology(next);
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
  const handleVisibilityChange = () => {
    setPageVisible(document.visibilityState === "visible");
    api.send("ui/state", {
      visible: document.visibilityState === "visible",
      scopeExpanded: activeTab() === "scope",
    });
  };

  onMount(() => {
    disposed = false;
    api.on("connection/state", handleConnectionState);
    api.on("topology/changed", handleTopologyChanged);
    api.on("scope/status", handleScopeStatus);
    api.on("scope/run-mode", handleScopeRunMode);
    api.on("scope/capture", handleScopeCapture);
    api.on("scope/roll-batch", handleScopeRollBatch);
    api.on("error", handleApiError);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void (async () => {
      await initLocale();
      if (disposed) return;
      await restorePreferences();
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
    api.off("scope/status", handleScopeStatus);
    api.off("scope/run-mode", handleScopeRunMode);
    api.off("scope/capture", handleScopeCapture);
    api.off("scope/roll-batch", handleScopeRollBatch);
    api.off("error", handleApiError);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    clearTimeout(preferenceSaveTimer);
  });

  return {
    connection: { connected, topology },
    navigation: {
      activeTab,
      treeOpen,
      openTree: () => setTreeOpen(true),
      setTreeOpen,
      selectTab: (tab: ActiveTab) => {
        setActiveTab(tab);
        setTreeOpen(false);
      },
    },
    browse: {
      category,
      setCategory,
      categoryCount,
      filter,
      setFilter,
      sourceRows,
      displayedRows,
      selected,
      setSelected,
      watches,
      clearWatches: () => setWatches([]),
      expandedGroups,
      isWatched,
      toggleGroup,
      toggleWatch,
      refresh,
      inspectOnScope,
    },
    scope: {
      status: scopeStatus,
      runMode: scopeRunMode,
      capture,
      rollFrame,
      channels,
      thread: scopeThread,
      multiplier: scopeMultiplier,
      triggerMode,
      triggerChannel: activeTriggerChannel,
      triggerEdge,
      triggerLevel,
      preTriggerRatio,
      displays: scopeDisplays,
      activeChannel: activeScopeChannel,
      skippedCaptures,
      action: scopeAction,
      setActiveChannel: setActiveScopeChannel,
      updateDisplay: updateScopeDisplay,
      removeChannel: removeScopeChannel,
      setThread: (thread: string) => {
        setScopeThread(thread);
        void configureScope();
      },
      setMultiplier: (multiplier: number) => {
        setScopeMultiplier(multiplier);
        void configureScope();
      },
      setTriggerMode: (mode: "auto" | "normal") => {
        setTriggerMode(mode);
        void configureScope();
      },
      setTriggerChannel: (channel: number) => {
        setActiveTriggerChannel(channel);
        void configureScope();
      },
      setTriggerEdge: (edge: "rising" | "falling") => {
        setTriggerEdge(edge);
        void configureScope();
      },
      setTriggerLevel: (level: number) => {
        setTriggerLevel(level);
        queueMicrotask(() => void configureScope());
      },
      setPreTriggerRatio: (ratio: number) => {
        setPreTriggerRatio(ratio);
        void configureScope();
      },
    },
    editor: {
      ref: editRef,
      value: editValue,
      currentValue: () => {
        const ref = editRef();
        return ref ? values().get(key(ref)) : undefined;
      },
      open: (row: Row) => {
        if (!row.ref) return;
        setEditRef(row.ref);
        setEditValue(String(row.value ?? ""));
      },
      close: () => setEditRef(null),
      setValue: setEditValue,
      write: writeValue,
    },
    error: {
      message: error,
      dismiss: () => setError(""),
    },
  };
}

export type HalInspectorController = ReturnType<
  typeof createHalInspectorController
>;

const HalInspectorContext = createContext<HalInspectorController>();

export const HalInspectorProvider: ParentComponent = (props) => {
  const controller = createHalInspectorController();
  return (
    <HalInspectorContext.Provider value={controller}>
      {props.children}
    </HalInspectorContext.Provider>
  );
};

export function useHalInspector(): HalInspectorController {
  const controller = useContext(HalInspectorContext);
  if (!controller)
    throw new Error("useHalInspector must be used inside HalInspectorProvider");
  return controller;
}
