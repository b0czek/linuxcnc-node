import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HostConnection } from "@edenapp/types/ipc";
import {
  HalComponent,
  ScopeController,
  getInfoComponents,
  getInfoFunctions,
  getInfoParams,
  getInfoPins,
  getInfoSignals,
  getInfoThreads,
  getValues,
  setPinParamValue,
  setSignalValue,
} from "@linuxcnc-node/hal";
import type {
  HalItemRef,
  HalType,
  HalValue,
  ScopeAcquisitionConfig,
  ScopeCapture,
} from "@linuxcnc-node/types";
import type {
  Bootstrap,
  HalInspectorProtocol,
  InspectorErrorCode,
  RpcResult,
  TopologySnapshot,
} from "../../shared/protocol";

const runFile = promisify(execFile);
const api = worker!.getAppAPI() as HostConnection<HalInspectorProtocol>;

let component: HalComponent | null = null;
let connected = false;
let startupError = "HAL Inspector is starting";
let topologyRevision = 0;
let topology: TopologySnapshot | null = null;
let topologyFingerprint = "";
let subscribed: HalItemRef[] = [];
let pollIntervalMs = 100;
let pollTimer: NodeJS.Timeout | undefined;
let topologyTimer: NodeJS.Timeout | undefined;
let valueCursor = 0;
let previousValues = new Map<string, HalValue>();
let visible = true;
let scopeExpanded = false;
let scope: ScopeController | null = null;
let scopeTimer: NodeJS.Timeout | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
let runMode: "single" | "continuous" | null = null;
let operationQueue: Promise<unknown> = Promise.resolve();
let captureId = 0;
let inFlightCapture: number | null = null;
let pendingCapture: ScopeCapture | null = null;
let skippedCaptures = 0;

const ok = <T>(value: T): RpcResult<T> => ({ ok: true, value });
const fail = <T>(code: InspectorErrorCode, error: unknown): RpcResult<T> => ({
  ok: false,
  error: {
    code,
    message: error instanceof Error ? error.message : String(error),
  },
});
const refKey = (ref: HalItemRef) => `${ref.kind}:${ref.name}`;

function classifyScopeError(error: unknown): InspectorErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/already active/i.test(message)) return "SCOPE_CONFLICT";
  if (/ABI|shared-memory/i.test(message)) return "ABI_MISMATCH";
  if (/source|thread|multiplier/i.test(message)) return "SCOPE_INVALID_SOURCE";
  return "SCOPE_UNAVAILABLE";
}

function snapshot(): TopologySnapshot {
  const next = {
    revision: topologyRevision,
    components: getInfoComponents(),
    pins: getInfoPins(),
    params: getInfoParams(),
    signals: getInfoSignals(),
    functions: getInfoFunctions(),
    threads: getInfoThreads(),
  };
  const fingerprint = JSON.stringify({
    c: next.components.map(({ id, name, kind, ready }) => [
      id,
      name,
      kind,
      ready,
    ]),
    p: next.pins.map(({ name, type, direction, signalName }) => [
      name,
      type,
      direction,
      signalName,
    ]),
    a: next.params.map(({ name, type, direction }) => [name, type, direction]),
    s: next.signals.map(({ name, type, readers, writers, bidirs }) => [
      name,
      type,
      readers,
      writers,
      bidirs,
    ]),
    f: next.functions.map(({ name, ownerId, users }) => [name, ownerId, users]),
    t: next.threads.map(({ name, periodNs, priority, running, functions }) => [
      name,
      periodNs,
      priority,
      running,
      functions,
    ]),
  });
  if (fingerprint !== topologyFingerprint) {
    topologyFingerprint = fingerprint;
    next.revision = ++topologyRevision;
  }
  topology = next;
  return next;
}

function refreshTopology(send = false): TopologySnapshot {
  const previous = topologyRevision;
  const next = snapshot();
  if (send && next.revision !== previous) api.send("topology/changed", next);
  return next;
}

function pollValues(): void {
  if (!visible || subscribed.length === 0) return;
  try {
    const values = getValues(subscribed);
    const changed: Array<{ ref: HalItemRef; value: HalValue }> = [];
    subscribed.forEach((ref, index) => {
      const value = values[index];
      const key = refKey(ref);
      if (!Object.is(previousValues.get(key), value)) {
        previousValues.set(key, value);
        changed.push({ ref, value });
      }
    });
    if (changed.length)
      api.send("values/delta", { cursor: ++valueCursor, values: changed });
  } catch (error) {
    connected = false;
    api.send("connection/state", { connected: false, message: String(error) });
  }
}

function restartValueTimer(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollValues, pollIntervalMs);
}

function itemMeta(ref: HalItemRef) {
  if (!topology) refreshTopology();
  if (ref.kind === "pin")
    return topology!.pins.find((item) => item.name === ref.name);
  if (ref.kind === "param")
    return topology!.params.find((item) => item.name === ref.name);
  return topology!.signals.find((item) => item.name === ref.name);
}

function parseWrite(type: HalType, input: string | number | boolean): HalValue {
  if (type === "bit") {
    if (
      input === true ||
      input === 1 ||
      input === "1" ||
      String(input).toLowerCase() === "true"
    )
      return true;
    if (
      input === false ||
      input === 0 ||
      input === "0" ||
      String(input).toLowerCase() === "false"
    )
      return false;
    throw new Error("Expected true/false or 1/0");
  }
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value))
    throw new Error("A finite numeric value is required");
  if (type !== "float" && !Number.isInteger(value))
    throw new Error("An integer value is required");
  const ranges: Partial<Record<HalType, [number, number]>> = {
    s32: [-2147483648, 2147483647],
    u32: [0, 4294967295],
    s64: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    u64: [0, Number.MAX_SAFE_INTEGER],
  };
  const range = ranges[type];
  if (range && (value < range[0] || value > range[1]))
    throw new Error(`Value is outside the safe ${type} range`);
  return value;
}

async function ensureScope(preferred = 32000): Promise<ScopeController> {
  if (scope) return scope;
  if (!getInfoFunctions().some((fn) => fn.name === "scope.sample")) {
    const samples = Math.max(1000, Math.min(1_000_000, Math.trunc(preferred)));
    await runFile("halcmd", ["loadrt", "scope_rt", `num_samples=${samples}`], {
      timeout: 5000,
    });
  }
  scope = new ScopeController();
  heartbeatTimer = setInterval(() => {
    try {
      scope?.heartbeat();
    } catch (error) {
      api.send("error", {
        code: classifyScopeError(error),
        message: String(error),
      });
    }
  }, 100);
  scopeTimer = setInterval(pollScope, 20);
  return scope;
}

function deliverCapture(capture: ScopeCapture): void {
  if (!visible || !scopeExpanded || inFlightCapture !== null) {
    if (pendingCapture) skippedCaptures++;
    pendingCapture = capture;
    return;
  }
  const id = ++captureId;
  inFlightCapture = id;
  api.send("scope/capture", { id, capture, skipped: skippedCaptures });
  skippedCaptures = 0;
}

function pollScope(): void {
  if (!scope) return;
  try {
    const status = scope.status();
    api.send("scope/status", status);
    if (status.state !== "done") return;
    const capture = scope.consume();
    if (capture) deliverCapture(capture);
    if (runMode === "continuous") scope.start();
    else runMode = null;
  } catch (error) {
    api.send("error", {
      code: classifyScopeError(error),
      message: String(error),
    });
    runMode = null;
  }
}

function queued<T>(
  operation: () => Promise<RpcResult<T>> | RpcResult<T>
): Promise<RpcResult<T>> {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

api.handle("bootstrap/get", () => {
  if (!connected) return fail("DISCONNECTED", startupError);
  try {
    const value: Bootstrap = {
      connected,
      topology: refreshTopology(),
      cursor: valueCursor,
      scope: scope?.status() ?? null,
    };
    return ok(value);
  } catch (error) {
    return fail("DISCONNECTED", error);
  }
});
api.handle("topology/refresh", () => {
  if (!connected) return fail("DISCONNECTED", startupError);
  try {
    return ok(refreshTopology());
  } catch (error) {
    return fail("DISCONNECTED", error);
  }
});
api.handle("subscriptions/set", ({ refs, intervalMs }) => {
  subscribed = [...new Map(refs.map((ref) => [refKey(ref), ref])).values()];
  pollIntervalMs = Math.max(50, Math.min(1000, Math.trunc(intervalMs)));
  previousValues.clear();
  restartValueTimer();
  pollValues();
  return ok({ intervalMs: pollIntervalMs });
});
api.handle("item/write", ({ ref, value }) => {
  try {
    const meta = itemMeta(ref);
    if (!meta)
      return fail("NOT_FOUND", `${ref.kind} '${ref.name}' is unavailable`);
    const writable =
      ref.kind === "param"
        ? "direction" in meta && meta.direction === "rw"
        : ref.kind === "pin"
        ? "direction" in meta &&
          meta.direction !== "out" &&
          !("signalName" in meta && meta.signalName)
        : "writers" in meta && meta.writers === 0;
    if (!writable)
      return fail("NOT_WRITABLE", `${ref.name} is not safely writable`);
    const parsed = parseWrite(meta.type, value);
    if (ref.kind === "signal") setSignalValue(ref.name, parsed);
    else setPinParamValue(ref.name, parsed);
    return ok({ value: getValues([ref])[0] });
  } catch (error) {
    return fail("INVALID_VALUE", error);
  }
});
api.handle("scope/ensure", ({ preferredBufferSize }) =>
  queued(async () => {
    try {
      return ok((await ensureScope(preferredBufferSize)).status());
    } catch (error) {
      return fail(classifyScopeError(error), error);
    }
  })
);
api.handle("scope/configure", (config: ScopeAcquisitionConfig) =>
  queued(async () => {
    try {
      const controller = await ensureScope();
      const wasContinuous = runMode === "continuous";
      const status = controller.configure(config);
      if (wasContinuous) controller.start();
      return ok(wasContinuous ? controller.status() : status);
    } catch (error) {
      return fail(classifyScopeError(error), error);
    }
  })
);
api.handle("scope/run", ({ mode }) =>
  queued(async () => {
    try {
      const controller = await ensureScope();
      runMode = mode;
      controller.start();
      return ok(controller.status());
    } catch (error) {
      return fail(classifyScopeError(error), error);
    }
  })
);
api.handle("scope/stop", () =>
  queued(() => {
    try {
      if (!scope) return fail("SCOPE_UNAVAILABLE", "Scope is not attached");
      runMode = null;
      scope.stop();
      return ok(scope.status());
    } catch (error) {
      return fail(classifyScopeError(error), error);
    }
  })
);
api.handle("scope/force-trigger", () =>
  queued(() => {
    try {
      if (!scope) return fail("SCOPE_UNAVAILABLE", "Scope is not attached");
      scope.forceTrigger();
      return ok(scope.status());
    } catch (error) {
      return fail(classifyScopeError(error), error);
    }
  })
);

api.on("ui/state", (state) => {
  visible = state.visible;
  scopeExpanded = state.scopeExpanded;
  if (visible) {
    pollValues();
    refreshTopology(true);
  }
  if (visible && scopeExpanded && pendingCapture && inFlightCapture === null) {
    const capture = pendingCapture;
    pendingCapture = null;
    deliverCapture(capture);
  }
});
api.on("scope/capture-ack", ({ id }) => {
  if (inFlightCapture !== id) return;
  inFlightCapture = null;
  if (visible && scopeExpanded && pendingCapture) {
    const capture = pendingCapture;
    pendingCapture = null;
    deliverCapture(capture);
  }
});

function cleanup(): void {
  if (pollTimer) clearInterval(pollTimer);
  if (topologyTimer) clearInterval(topologyTimer);
  if (scopeTimer) clearInterval(scopeTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  scope?.dispose();
  scope = null;
}

function initialize(): void {
  try {
    component = new HalComponent(`hal-inspector-${process.pid}`);
    component.ready();
    refreshTopology();
    restartValueTimer();
    topologyTimer = setInterval(() => {
      if (visible) {
        try {
          refreshTopology(true);
        } catch {
          /* connection event comes from value poll */
        }
      }
    }, 2000);
    connected = true;
    startupError = "";
    api.send("connection/state", { connected: true });
  } catch (error) {
    connected = false;
    startupError = error instanceof Error ? error.message : String(error);
    console.error("HAL initialization failed:", error);
    api.send("connection/state", {
      connected: false,
      message: startupError,
    });
  }
}

// Eden marks a backend ready only after this module finishes evaluating.
// Defer native HAL attachment so a slow or unavailable HAL cannot consume the
// process manager's startup timeout before the frontend/backend IPC is ready.
setImmediate(initialize);

process.once("exit", cleanup);
process.once("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
