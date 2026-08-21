import type { HostConnection } from "@edenapp/types/ipc";
import type { HalItemRef, HalType, HalValue, ScopeAcquisitionConfig, ScopeCapture, ScopeCaptureDelta, ScopeStatus } from "@linuxcnc-node/types";
import type { Bootstrap, HalInspectorProtocol, InspectorErrorCode, RpcResult, ScopeRunMode, TopologySnapshot } from "../../shared/protocol";
import { classifyGrpcError, createHalScopeClient, mapScopeCapture, mapScopeDelta, mapScopeStatus, scopeAck, scopeConfigure, scopeRun, scopeStop, scopeTrigger, wireScopeConfig, type HalScopeClient, type ScopeSession } from "./grpc";

const api = worker!.getAppAPI() as HostConnection<HalInspectorProtocol>;
let client: HalScopeClient | null = null;
let scope: ScopeSession | null = null;
let scopeOff: (() => void) | null = null;
let connected = false;
let startupError = "HAL Inspector is starting";
let topologyRevision = 0;
let topology: TopologySnapshot | null = null;
let subscribed: HalItemRef[] = [];
let pollIntervalMs = 100;
let pollTimer: NodeJS.Timeout | undefined;
let valueCursor = 0;
let previousValues = new Map<string, HalValue>();
let visible = true;
let scopeExpanded = false;
let runMode: ScopeRunMode = "stop";
let scopeConfig: ScopeAcquisitionConfig | null = null;
let operationQueue: Promise<unknown> = Promise.resolve();
let captureId = 0;
let inFlightCapture: number | null = null;
let inFlightGeneration: number | undefined;
let pendingCapture: ScopeCapture | null = null;
let pendingRoll: ScopeCaptureDelta | null = null;
let skippedCaptures = 0;
let rollGeneration = 0;

const refKey = (ref: HalItemRef) => `${ref.kind}:${ref.name}`;
const ok = <T>(value: T): RpcResult<T> => ({ ok: true, value });
const fail = <T>(code: InspectorErrorCode, error: unknown): RpcResult<T> => ({ ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } });
const defaultScopeStatus = (): ScopeStatus => ({ state: "idle", bufferLength: 0, recordLength: 0, sampleLength: 0, samples: 0, start: 0, multiplier: 1, watchdog: 0, threadName: "", samplePeriodNs: 0 });

function setRunMode(mode: ScopeRunMode): void { if (runMode !== mode) { runMode = mode; api.send("scope/run-mode", { mode }); } }
function copyScopeConfig(config: ScopeAcquisitionConfig): ScopeAcquisitionConfig { return { ...config, channels: config.channels.map((channel) => channel ? { ...channel } : null) }; }
function rollConfig(config: ScopeAcquisitionConfig, recordLength: number): ScopeAcquisitionConfig { return { ...copyScopeConfig(config), preTrigger: Math.max(0, recordLength - 1), triggerChannel: 0, automatic: false }; }

function parseWrite(type: HalType, input: string | number | boolean): HalValue {
  if (type === "bit") {
    if (input === true || input === 1 || input === "1" || String(input).toLowerCase() === "true") return true;
    if (input === false || input === 0 || input === "0" || String(input).toLowerCase() === "false") return false;
    throw new Error("Expected true/false or 1/0");
  }
  if (type === "s64" || type === "u64") {
    const text = typeof input === "number" ? (Number.isSafeInteger(input) ? String(input) : "") : typeof input === "string" ? input.trim() : "";
    if (!/^[+-]?\d+$/.test(text)) throw new Error(`${type} requires a decimal integer`);
    const value = BigInt(text);
    const min = type === "s64" ? -(1n << 63n) : 0n;
    const max = type === "s64" ? (1n << 63n) - 1n : (1n << 64n) - 1n;
    if (value < min || value > max) throw new Error(`Value is outside the ${type} range`);
    return value;
  }
  if (typeof input === "boolean") throw new Error("A finite numeric value is required");
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) throw new Error("A finite numeric value is required");
  if (type === "s32" || type === "u32") {
    if (!Number.isSafeInteger(value)) throw new Error("An integer value is required");
    const min = type === "s32" ? -2147483648 : 0;
    const max = type === "s32" ? 2147483647 : 4294967295;
    if (value < min || value > max) throw new Error(`Value is outside the ${type} range`);
  }
  return value;
}

function itemMeta(ref: HalItemRef): any {
  if (!topology) return undefined;
  return ref.kind === "pin" ? topology.pins.find((item) => item.name === ref.name) : ref.kind === "param" ? topology.params.find((item) => item.name === ref.name) : topology.signals.find((item) => item.name === ref.name);
}

async function refreshTopology(send = false): Promise<TopologySnapshot> {
  if (!client) throw new Error(startupError);
  const previous = topology;
  const next = await client.getTopology();
  topologyRevision = Math.max(topologyRevision + 1, next.revision);
  topology = { ...next, revision: topologyRevision };
  const shape = (value: TopologySnapshot) => JSON.stringify({
    c: value.components.map(({ id, name, kind, ready }) => [id, name, kind, ready]),
    p: value.pins.map(({ name, type, direction, signalName }) => [name, type, direction, signalName]),
    a: value.params.map(({ name, type, direction }) => [name, type, direction]),
    s: value.signals.map(({ name, type, readers, writers, bidirs }) => [name, type, readers, writers, bidirs]),
    f: value.functions.map(({ name, ownerId, users }) => [name, ownerId, users]),
    t: value.threads.map(({ name, periodNs, priority, running, functions }) => [name, periodNs, priority, running, functions]),
  });
  if (send && (!previous || shape(previous) !== shape(topology))) api.send("topology/changed", topology);
  return topology;
}

async function pollValues(): Promise<void> {
  if (!client || !visible || subscribed.length === 0) return;
  try {
    const values = await client.read(subscribed);
    const changed: Array<{ ref: HalItemRef; value: HalValue }> = [];
    subscribed.forEach((ref, index) => { const value = values[index]; if (value === undefined) return; const key = refKey(ref); if (!Object.is(previousValues.get(key), value)) { previousValues.set(key, value); changed.push({ ref, value }); } });
    if (changed.length) api.send("values/delta", { cursor: ++valueCursor, values: changed });
  } catch (error) { connected = false; api.send("connection/state", { connected: false, message: String(error) }); }
}
function restartValueTimer(): void { if (pollTimer) clearInterval(pollTimer); pollTimer = setInterval(() => void pollValues(), pollIntervalMs); }

function deliverCapture(capture: ScopeCapture): void {
  if (!visible || !scopeExpanded || inFlightCapture !== null) { if (pendingCapture) skippedCaptures++; pendingCapture = capture; return; }
  const id = ++captureId; inFlightCapture = id; inFlightGeneration = capture.generation;
  api.send("scope/capture", { id, capture, skipped: skippedCaptures }); skippedCaptures = 0;
}
function mergeRollBatches(previous: ScopeCaptureDelta | null, next: ScopeCaptureDelta): ScopeCaptureDelta {
  if (!previous || next.reset || previous.capacity !== next.capacity || previous.samplePeriodNs !== next.samplePeriodNs || next.sequence !== previous.sequence + next.samples) return next;
  const total = previous.samples + next.samples; const kept = Math.min(next.capacity, total); const trim = total - kept;
  return { ...next, samples: kept, reset: previous.reset || trim > 0, channels: next.channels.map((channel, index) => { const before = previous.channels[index]; if (!channel || !before) return channel; const merged = new Float64Array(kept); const beforeStart = Math.min(before.length, trim); const beforeKept = before.length - beforeStart; merged.set(before.subarray(beforeStart), 0); merged.set(channel.subarray(Math.max(0, channel.length - (kept - beforeKept))), beforeKept); return merged; }) };
}
function deliverRoll(batch: ScopeCaptureDelta): void {
  if (!visible || !scopeExpanded || inFlightCapture !== null) { if (pendingRoll) skippedCaptures++; pendingRoll = mergeRollBatches(pendingRoll, batch); return; }
  const id = ++captureId; inFlightCapture = id; inFlightGeneration = batch.generation;
  api.send("scope/roll-batch", { id, generation: rollGeneration, batch, skipped: skippedCaptures }); skippedCaptures = 0;
}

async function ensureScope(): Promise<ScopeSession> {
  if (scope) return scope;
  if (!client) throw new Error(startupError);
  scope = await client.openScope();
  scopeOff = scope.onMessage((message) => {
    if (message.status) api.send("scope/status", mapScopeStatus(message.status));
    if (message.capture) deliverCapture(mapScopeCapture(message.capture));
    if (message.roll) deliverRoll(mapScopeDelta(message.roll));
  });
  return scope;
}
function queued<T>(operation: () => Promise<RpcResult<T>> | RpcResult<T>): Promise<RpcResult<T>> { const next = operationQueue.then(operation, operation); operationQueue = next.then(() => undefined, () => undefined); return next; }

api.handle("bootstrap/get", async () => { if (!connected) return fail("DISCONNECTED", startupError); try { const value: Bootstrap = { connected, topology: await refreshTopology(), cursor: valueCursor, scope: scope?.status ?? null, scopeRunMode: runMode }; return ok(value); } catch (error) { return fail("DISCONNECTED", error); } });
api.handle("topology/refresh", async () => { if (!connected) return fail("DISCONNECTED", startupError); try { return ok(await refreshTopology()); } catch (error) { return fail("DISCONNECTED", error); } });
api.handle("subscriptions/set", async ({ refs, intervalMs }) => { subscribed = [...new Map(refs.map((ref) => [refKey(ref), ref])).values()]; pollIntervalMs = Math.max(50, Math.min(1000, Math.trunc(intervalMs))); previousValues.clear(); restartValueTimer(); await pollValues(); return ok({ intervalMs: pollIntervalMs }); });
api.handle("item/write", async ({ ref, value }) => { try { const meta = itemMeta(ref); if (!meta) return fail("NOT_FOUND", `${ref.kind} '${ref.name}' is unavailable`); const writable = ref.kind === "param" ? meta.direction === "rw" : ref.kind === "pin" ? meta.direction !== "out" && !meta.signalName : meta.writers === 0; if (!writable) return fail("NOT_WRITABLE", `${ref.name} is not safely writable`); const parsed = parseWrite(meta.type, value); if (!client) return fail("DISCONNECTED", startupError); const written = await client.write(ref, meta.type, parsed); previousValues.set(refKey(ref), written); return ok({ value: written }); } catch (error) { return fail("INVALID_VALUE", error); } });

api.handle("scope/ensure", () => queued(async () => { try { return ok((await ensureScope()).status ?? defaultScopeStatus()); } catch (error) { return fail(classifyGrpcError(error), error); } }));
api.handle("scope/configure", (config: ScopeAcquisitionConfig) => queued(async () => { try { const session = await ensureScope(); scopeConfig = copyScopeConfig(config); const wasRunning = runMode === "run"; const wasRolling = runMode === "roll"; const wasSingle = runMode === "single"; const current = session.status ?? defaultScopeStatus(); session.send(scopeConfigure(wireScopeConfig(config))); if (wasRolling) { pendingCapture = null; pendingRoll = null; skippedCaptures = 0; rollGeneration++; session.send(scopeConfigure(wireScopeConfig(rollConfig(scopeConfig, current.recordLength)))); session.send(scopeRun(3)); return ok({ ...current, state: "init" }); } if (wasRunning) session.send(scopeRun(1)); if (wasSingle) setRunMode("stop"); return ok(session.status ?? current); } catch (error) { setRunMode("stop"); return fail(classifyGrpcError(error), error); } }));
api.handle("scope/run", ({ mode }) => queued(async () => { try { const session = await ensureScope(); if (!scopeConfig) return fail("SCOPE_INVALID_SOURCE", "Configure scope channels before starting acquisition"); const current = session.status ?? defaultScopeStatus(); pendingCapture = null; pendingRoll = null; skippedCaptures = 0; const config = mode === "roll" ? rollConfig(scopeConfig, current.recordLength) : scopeConfig; session.send(scopeConfigure(wireScopeConfig(config))); if (mode === "roll") rollGeneration++; session.send(scopeRun(mode === "run" ? 1 : mode === "single" ? 2 : 3)); setRunMode(mode); return ok(session.status ?? current); } catch (error) { setRunMode("stop"); return fail(classifyGrpcError(error), error); } }));
api.handle("scope/stop", () => queued(async () => { try { if (!scope) return fail("SCOPE_UNAVAILABLE", "Scope is not attached"); scope.send(scopeStop()); setRunMode("stop"); pendingRoll = null; return ok(scope.status ?? defaultScopeStatus()); } catch (error) { return fail(classifyGrpcError(error), error); } }));
api.handle("scope/force-trigger", () => queued(async () => { try { if (!scope) return fail("SCOPE_UNAVAILABLE", "Scope is not attached"); if (runMode === "roll") return fail("INVALID_VALUE", "Force trigger is unavailable in Roll mode"); scope.send(scopeTrigger()); return ok(scope.status ?? defaultScopeStatus()); } catch (error) { return fail(classifyGrpcError(error), error); } }));

api.on("ui/state", (state) => { visible = state.visible; scopeExpanded = state.scopeExpanded; if (visible) void pollValues(); if (visible && scopeExpanded && pendingCapture && inFlightCapture === null) { const capture = pendingCapture; pendingCapture = null; deliverCapture(capture); } if (visible && scopeExpanded && pendingRoll && inFlightCapture === null) { const batch = pendingRoll; pendingRoll = null; deliverRoll(batch); } });
api.on("scope/capture-ack", ({ id }) => { if (inFlightCapture !== id) return; scope?.send(scopeAck(inFlightGeneration ?? BigInt(id))); inFlightCapture = null; inFlightGeneration = undefined; if (visible && scopeExpanded && pendingRoll) { const batch = pendingRoll; pendingRoll = null; deliverRoll(batch); } else if (visible && scopeExpanded && pendingCapture) { const capture = pendingCapture; pendingCapture = null; deliverCapture(capture); } });

async function initialize(): Promise<void> { try { client = await createHalScopeClient(); topology = await client.getTopology(); client.watchTopology((next) => { topology = { ...next, revision: ++topologyRevision }; api.send("topology/changed", topology); }); restartValueTimer(); connected = true; startupError = ""; api.send("connection/state", { connected: true }); } catch (error) { connected = false; startupError = error instanceof Error ? error.message : String(error); console.error("LinuxCNC gRPC initialization failed:", error); api.send("connection/state", { connected: false, message: startupError }); } }
function cleanup(): void { if (pollTimer) clearInterval(pollTimer); scopeOff?.(); scope?.close(); scope = null; client?.close(); client = null; }
setImmediate(() => void initialize());
process.once("exit", cleanup);
process.once("SIGTERM", () => { cleanup(); process.exit(0); });
