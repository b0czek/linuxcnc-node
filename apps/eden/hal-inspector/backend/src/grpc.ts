import {
  createLinuxCncClients,
  HalComponentKind,
  HalParamDirection,
  HalPinDirection,
  type HalScalar,
  ScopeRuntimeState,
  type ScopeSessionMessage,
  type ScopeSessionMessage__Output,
  HalItemKind as WireHalItemKind,
  type HalItemRef as WireHalItemRef,
  HalType as WireHalType,
  type ScopeAcquisitionConfig as WireScopeAcquisitionConfig,
} from "@linuxcnc-node/grpc-client";
import type {
  HalComponentInfo,
  HalFunctionInfo,
  HalItemRef,
  HalParamInfo,
  HalPinInfo,
  HalSignalInfo,
  HalThreadInfo,
  HalType,
  HalValue,
  ScopeAcquisitionConfig,
  ScopeCapture,
  ScopeCaptureDelta,
  ScopeStatus,
} from "@linuxcnc-node/types";
import type {
  InspectorErrorCode,
  TopologySnapshot,
} from "../../shared/protocol";
import { readGrpcConfig } from "./config";

const EMPTY = {};
const MAX_GRPC_MESSAGE_BYTES = 16 * 1024 * 1024 + 64 * 1024;
const toNumber = (
  value: bigint | string | number | undefined,
  name: string,
): number => {
  if (value === undefined) return 0;
  const number = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(number) && !Number.isFinite(number))
    throw new Error(`${name} is not a finite number`);
  if (!Number.isSafeInteger(number))
    throw new Error(`${name} is outside the safe JavaScript range`);
  return number;
};
const optionalNumber = (
  value: bigint | string | number | undefined,
  name: string,
): number | undefined =>
  value === undefined ? undefined : toNumber(value, name);

function enumName(value: unknown): string {
  return typeof value === "number" ? String(value) : String(value ?? "");
}

function unary<T>(
  call: (
    request: any,
    callback: (error: Error | null, response: T) => void,
  ) => unknown,
  request: any,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    call(request, (error, response) =>
      error ? reject(error) : resolve(response),
    );
  });
}

export function wireItemRef(ref: HalItemRef): WireHalItemRef {
  const kind =
    ref.kind === "pin"
      ? WireHalItemKind.HAL_ITEM_KIND_PIN
      : ref.kind === "param"
        ? WireHalItemKind.HAL_ITEM_KIND_PARAM
        : WireHalItemKind.HAL_ITEM_KIND_SIGNAL;
  return { kind, name: ref.name };
}

export function domainHalType(type: WireHalType | undefined): HalType {
  switch (type) {
    case WireHalType.HAL_TYPE_BIT:
      return "bit";
    case WireHalType.HAL_TYPE_FLOAT:
      return "float";
    case WireHalType.HAL_TYPE_S32:
      return "s32";
    case WireHalType.HAL_TYPE_U32:
      return "u32";
    case WireHalType.HAL_TYPE_S64:
      return "s64";
    case WireHalType.HAL_TYPE_U64:
      return "u64";
    default:
      throw new Error(`Unknown HAL scalar type ${enumName(type)}`);
  }
}

/** Decode the protobuf scalar oneof without passing 64-bit values through Number. */
export function domainHalValue(value: HalScalar | undefined): HalValue {
  if (!value) throw new Error("HAL response omitted its scalar value");
  switch (value.value) {
    case "bit":
      return Boolean(value.bit);
    case "floatValue":
      return Number(value.floatValue);
    case "s32":
      return Number(value.s32);
    case "u32":
      return Number(value.u32);
    case "s64":
      return BigInt(value.s64?.toString() ?? "0");
    case "u64":
      return BigInt(value.u64?.toString() ?? "0");
    default:
      throw new Error(`HAL response omitted a supported scalar value`);
  }
}

export function wireHalValue(type: HalType, value: HalValue): HalScalar {
  switch (type) {
    case "bit":
      return {
        type: WireHalType.HAL_TYPE_BIT,
        value: "bit",
        bit: Boolean(value),
      };
    case "float":
      return {
        type: WireHalType.HAL_TYPE_FLOAT,
        value: "floatValue",
        floatValue: Number(value),
      };
    case "s32":
      return {
        type: WireHalType.HAL_TYPE_S32,
        value: "s32",
        s32: Number(value),
      };
    case "u32":
      return {
        type: WireHalType.HAL_TYPE_U32,
        value: "u32",
        u32: Number(value),
      };
    // proto-loader serializes int64/uint64 from decimal strings.  This is
    // deliberately the only conversion at the wire boundary; values decoded
    // from the daemon remain bigint in the Inspector domain.
    case "s64":
      return {
        type: WireHalType.HAL_TYPE_S64,
        value: "s64",
        s64: (typeof value === "bigint" ? value : BigInt(value)).toString(),
      };
    case "u64":
      return {
        type: WireHalType.HAL_TYPE_U64,
        value: "u64",
        u64: (typeof value === "bigint" ? value : BigInt(value)).toString(),
      };
  }
}

function domainItemRef(ref: WireHalItemRef | undefined): HalItemRef {
  if (!ref?.name) throw new Error("HAL response omitted item identity");
  const kind =
    ref.kind === WireHalItemKind.HAL_ITEM_KIND_PIN
      ? "pin"
      : ref.kind === WireHalItemKind.HAL_ITEM_KIND_PARAM
        ? "param"
        : "signal";
  return { kind, name: ref.name };
}

function domainComponentKind(
  kind: HalComponentKind | undefined,
): HalComponentInfo["kind"] {
  switch (kind) {
    case HalComponentKind.HAL_COMPONENT_KIND_USER:
      return "user";
    case HalComponentKind.HAL_COMPONENT_KIND_REALTIME:
      return "realtime";
    case HalComponentKind.HAL_COMPONENT_KIND_OTHER:
      return "other";
    default:
      return "unknown";
  }
}

export function mapTopology(wire: any, revision: number): TopologySnapshot {
  const topology = wire?.topology ?? wire ?? EMPTY;
  const components: HalComponentInfo[] = (topology.components ?? []).map(
    (item: any) => ({
      id: Number(item.id ?? 0),
      name: String(item.name ?? ""),
      kind: domainComponentKind(item.kind),
      ready: Boolean(item.ready),
      ...(item.pid === undefined ? {} : { pid: Number(item.pid) }),
    }),
  );
  const pins: HalPinInfo[] = (topology.pins ?? []).map((item: any) => ({
    name: String(item.name ?? ""),
    value: domainHalValue(item.value),
    type: domainHalType(item.type),
    direction:
      item.direction === HalPinDirection.HAL_PIN_DIRECTION_OUT
        ? "out"
        : item.direction === HalPinDirection.HAL_PIN_DIRECTION_IO
          ? "io"
          : "in",
    ownerId: Number(item.ownerId ?? 0),
    ...(item.signalName ? { signalName: String(item.signalName) } : {}),
  }));
  const params: HalParamInfo[] = (topology.params ?? []).map((item: any) => ({
    name: String(item.name ?? ""),
    value: domainHalValue(item.value),
    type: domainHalType(item.type),
    direction:
      item.direction === HalParamDirection.HAL_PARAM_DIRECTION_RW ? "rw" : "ro",
    ownerId: Number(item.ownerId ?? 0),
  }));
  const signals: HalSignalInfo[] = (topology.signals ?? []).map(
    (item: any) => ({
      name: String(item.name ?? ""),
      value: domainHalValue(item.value),
      type: domainHalType(item.type),
      driver: item.driver ? String(item.driver) : null,
      readers: Number(item.readers ?? 0),
      writers: Number(item.writers ?? 0),
      bidirs: Number(item.bidir ?? item.bidirCount ?? item.bidirs ?? 0),
    }),
  );
  const functions: HalFunctionInfo[] = (topology.functions ?? []).map(
    (item: any) => ({
      name: String(item.name ?? ""),
      ownerId: Number(item.ownerId ?? 0),
      ownerName: String(item.ownerName ?? ""),
      usesFp: Boolean(item.usesFp),
      reentrant: Boolean(item.reentrant),
      users: Number(item.users ?? 0),
      ...(item.runtime === undefined ? {} : { runtime: Number(item.runtime) }),
      maxRuntime: Number(item.maxRuntime ?? 0),
      maxRuntimeIncreased: Boolean(item.maxRuntimeIncreased),
    }),
  );
  const threads: HalThreadInfo[] = (topology.threads ?? []).map(
    (item: any) => ({
      name: String(item.name ?? ""),
      periodNs: toNumber(item.periodNs, "HAL thread period"),
      priority: Number(item.priority ?? 0),
      usesFp: Boolean(item.usesFp),
      running: Boolean(item.running),
      ...(item.runtime === undefined ? {} : { runtime: Number(item.runtime) }),
      maxRuntime: Number(item.maxRuntime ?? 0),
      functions: (item.functions ?? []).map(String),
    }),
  );
  return { revision, components, pins, params, signals, functions, threads };
}

function mapScopeState(
  state: ScopeRuntimeState | undefined,
): ScopeStatus["state"] {
  switch (state) {
    case ScopeRuntimeState.SCOPE_RUNTIME_STATE_INIT:
      return "init";
    case ScopeRuntimeState.SCOPE_RUNTIME_STATE_PRE_TRIGGER:
      return "pre-trigger";
    case ScopeRuntimeState.SCOPE_RUNTIME_STATE_TRIGGER_WAIT:
      return "trigger-wait";
    case ScopeRuntimeState.SCOPE_RUNTIME_STATE_POST_TRIGGER:
      return "post-trigger";
    case ScopeRuntimeState.SCOPE_RUNTIME_STATE_DONE:
      return "done";
    case ScopeRuntimeState.SCOPE_RUNTIME_STATE_RESET:
      return "reset";
    case ScopeRuntimeState.SCOPE_RUNTIME_STATE_INVALID:
      return "invalid";
    default:
      return "idle";
  }
}

export function mapScopeStatus(value: any): ScopeStatus {
  return {
    state: mapScopeState(value?.state),
    bufferLength: Number(value?.bufferLength ?? 0),
    recordLength: Number(value?.recordLength ?? 0),
    sampleLength: Number(value?.sampleLength ?? 0),
    samples: Number(value?.samples ?? 0),
    start: Number(value?.start ?? 0),
    multiplier: Number(value?.multiplier ?? 1),
    watchdog: Number(value?.watchdog ?? 0),
    threadName: String(value?.threadName ?? ""),
    samplePeriodNs: toNumber(value?.samplePeriodNs, "scope sample period"),
  };
}

function mapChannels(channels: any[] | undefined): Array<Float64Array | null> {
  const values = channels ?? [];
  // New daemon frames carry the logical slot index so a disabled/null channel
  // cannot collapse the fixed scope layout.  Keep accepting the old ordered
  // representation while peers roll forward.
  const indexed = values.some(
    (channel) =>
      channel &&
      (Number.isInteger(channel.index) || channel.enabled !== undefined),
  );
  if (!indexed)
    return values.map((channel) =>
      channel ? new Float64Array(channel.values ?? []) : null,
    );
  const lastIndex = values.reduce(
    (max, channel, position) =>
      Math.max(
        max,
        channel && Number.isInteger(channel.index) ? channel.index : position,
      ),
    -1,
  );
  const mapped: Array<Float64Array | null> = new Array(lastIndex + 1).fill(
    null,
  );
  for (let position = 0; position < values.length; position++) {
    const channel = values[position];
    if (!channel || channel.enabled !== true) continue;
    const index = Number.isInteger(channel.index) ? channel.index : position;
    mapped[index] = new Float64Array(channel.values ?? []);
  }
  return mapped;
}

export function mapScopeCapture(value: any): ScopeCapture {
  const generation = optionalNumber(value?.generation, "scope generation");
  const skippedFrames = optionalNumber(
    value?.skippedFrames,
    "scope skipped frames",
  );
  return {
    channels: mapChannels(value?.channels),
    samples: Number(value?.samples ?? 0),
    triggerIndex: Number(value?.triggerIndex ?? 0),
    samplePeriodNs: toNumber(value?.samplePeriodNs, "scope sample period"),
    ...(generation === undefined ? {} : { generation }),
    ...(skippedFrames === undefined ? {} : { skippedFrames }),
  };
}

export function mapScopeDelta(value: any): ScopeCaptureDelta {
  const generation = optionalNumber(value?.generation, "scope generation");
  const skippedFrames = optionalNumber(
    value?.skippedFrames,
    "scope skipped frames",
  );
  return {
    channels: mapChannels(value?.channels),
    samples: Number(value?.samples ?? 0),
    capacity: Number(value?.capacity ?? 0),
    sequence: toNumber(value?.sequence, "scope sequence"),
    samplePeriodNs: toNumber(value?.samplePeriodNs, "scope sample period"),
    reset: Boolean(value?.reset),
    ...(generation === undefined ? {} : { generation }),
    ...(skippedFrames === undefined ? {} : { skippedFrames }),
  };
}

export function wireScopeConfig(
  config: ScopeAcquisitionConfig,
): WireScopeAcquisitionConfig {
  return {
    threadName: config.threadName,
    multiplier: config.multiplier,
    preTrigger: config.preTrigger,
    triggerChannel: config.triggerChannel,
    triggerLevel: config.triggerLevel,
    rising: config.rising,
    automatic: config.automatic,
    // Keep the fixed channel-slot layout.  Explicit indices ensure disabled
    // entries cannot collapse when the daemon reconstructs the configuration.
    channels: config.channels.map((channel, index) =>
      channel
        ? {
            item: wireItemRef(channel),
            enabled: channel.enabled,
            index,
          }
        : { enabled: false, index },
    ),
  };
}

export interface ScopeSession {
  send(message: ScopeSessionMessage): Promise<void>;
  close(): void;
  readonly status: ScopeStatus | null;
  readonly onMessage: (
    listener: (message: ScopeSessionMessage__Output) => void,
  ) => () => void;
  readonly onError: (listener: (error: Error) => void) => () => void;
}

export function scopeAcquire(): ScopeSessionMessage {
  return { message: "acquire", acquire: {} };
}
export function scopeConfigure(
  config: WireScopeAcquisitionConfig,
): ScopeSessionMessage {
  return { message: "configure", configure: { config } };
}
export function scopeRun(mode: 1 | 2 | 3): ScopeSessionMessage {
  return { message: "run", run: { mode } };
}
export function scopeStop(): ScopeSessionMessage {
  return { message: "stop", stop: {} };
}
export function scopeTrigger(): ScopeSessionMessage {
  return { message: "trigger", trigger: {} };
}
export function scopeAck(
  generation: bigint | number | string,
): ScopeSessionMessage {
  return { message: "ack", ack: { generation: generation.toString() } };
}

export interface HalScopeClient {
  getTopology(): Promise<TopologySnapshot>;
  watchTopology(listener: (topology: TopologySnapshot) => void): () => void;
  read(refs: readonly HalItemRef[]): Promise<HalValue[]>;
  write(ref: HalItemRef, type: HalType, value: HalValue): Promise<HalValue>;
  openScope(): Promise<ScopeSession>;
  close(): void;
}

export async function createHalScopeClient(): Promise<HalScopeClient> {
  const config = readGrpcConfig();
  const clients = await createLinuxCncClients({
    address: config.address,
    protoPath: config.protoPath,
    protoRoot: config.protoRoot,
    // config intentionally keeps credentials transport-agnostic so its parser
    // can be unit tested without constructing grpc-js objects.
    credentials: config.credentials as never,
    channelOptions: {
      "grpc.max_receive_message_length": MAX_GRPC_MESSAGE_BYTES,
    },
  });
  const hal = clients.hal;
  const scope = clients.scope;
  let revision = 0;
  let topology = mapTopology({}, revision);
  const topologyListeners = new Set<(value: TopologySnapshot) => void>();
  let watchStarted = false;
  let topologyStream: { cancel?: () => void; destroy?: () => void } | null =
    null;
  let topologyRetry: NodeJS.Timeout | undefined;
  let topologyRetryMs = 250;
  let closed = false;

  const scheduleTopologyWatch = (): void => {
    if (closed || topologyListeners.size === 0 || topologyRetry) return;
    topologyRetry = setTimeout(() => {
      topologyRetry = undefined;
      startTopologyWatch();
    }, topologyRetryMs);
    topologyRetryMs = Math.min(topologyRetryMs * 2, 5000);
  };

  const startTopologyWatch = (): void => {
    if (closed || watchStarted) return;
    watchStarted = true;
    void (async () => {
      try {
        const stream = hal.watchTopology(EMPTY) as AsyncIterable<any> & {
          cancel?: () => void;
          destroy?: () => void;
        };
        topologyStream = stream;
        for await (const event of stream) {
          topology = mapTopology(event, ++revision);
          topologyRetryMs = 250;
          for (const listener of topologyListeners) listener(topology);
        }
      } catch {
        // The unary snapshot remains usable while a transient watch reconnects.
      } finally {
        topologyStream = null;
        watchStarted = false;
        scheduleTopologyWatch();
      }
    })();
  };
  const client: HalScopeClient = {
    async getTopology() {
      topology = mapTopology(
        await unary<any>(
          (request, callback) => hal.getTopology(request, callback),
          EMPTY,
        ),
        ++revision,
      );
      startTopologyWatch();
      return topology;
    },
    watchTopology(listener) {
      topologyListeners.add(listener);
      startTopologyWatch();
      return () => topologyListeners.delete(listener);
    },
    async read(refs) {
      const response: any = await unary<any>(
        (request, callback) => hal.read(request, callback),
        { items: refs.map(wireItemRef) },
      );
      return (response.values ?? []).map((entry: any) =>
        domainHalValue(entry.value),
      );
    },
    async write(ref, type, value) {
      const response: any = await unary<any>(
        (request, callback) => hal.write(request, callback),
        {
          writes: [
            { item: wireItemRef(ref), value: wireHalValue(type, value) },
          ],
        },
      );
      return domainHalValue(response.values?.[0]?.value);
    },
    async openScope() {
      const listeners = new Set<
        (message: ScopeSessionMessage__Output) => void
      >();
      const errorListeners = new Set<(error: Error) => void>();
      let latestStatus: ScopeStatus | null = null;
      let streamError: Error | null = null;
      const acknowledgements: Array<{
        resolve: () => void;
        reject: (error: Error) => void;
      }> = [];
      const stream =
        scope.session() as AsyncIterable<ScopeSessionMessage__Output> & {
          write: (message: ScopeSessionMessage) => boolean;
          end: () => void;
          cancel?: () => void;
          destroy?: () => void;
        };
      const fail = (error: unknown): Error => {
        if (streamError) return streamError;
        const failure =
          error instanceof Error ? error : new Error(String(error));
        streamError = failure;
        for (const acknowledgement of acknowledgements.splice(0))
          acknowledgement.reject(failure);
        for (const listener of errorListeners) listener(failure);
        return failure;
      };
      const reader = (async () => {
        try {
          for await (const message of stream) {
            if (message.status) latestStatus = mapScopeStatus(message.status);
            for (const listener of listeners) listener(message);
            if (message.status) acknowledgements.shift()?.resolve();
          }
          throw new Error(
            "Scope session closed before the daemon acknowledged all commands",
          );
        } catch (error) {
          throw fail(error);
        } finally {
          stream.end();
        }
      })();
      // The reader is intentionally detached after its failures have been
      // converted into command rejections and application error callbacks.
      void reader.catch(() => undefined);
      const send = (message: ScopeSessionMessage): Promise<void> => {
        if (streamError) return Promise.reject(streamError);
        if (message.message === "ack") {
          try {
            stream.write(message);
            return Promise.resolve();
          } catch (error) {
            return Promise.reject(fail(error));
          }
        }
        return new Promise<void>((resolve, reject) => {
          acknowledgements.push({ resolve, reject });
          try {
            stream.write(message);
          } catch (error) {
            acknowledgements.pop();
            reject(fail(error));
          }
        });
      };
      await send(scopeAcquire());
      return {
        send,
        close() {
          stream.end();
          stream.cancel?.();
          stream.destroy?.();
        },
        get status() {
          return latestStatus;
        },
        onMessage(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        onError(listener) {
          errorListeners.add(listener);
          return () => errorListeners.delete(listener);
        },
      } satisfies ScopeSession;
    },
    close() {
      closed = true;
      if (topologyRetry) clearTimeout(topologyRetry);
      topologyStream?.cancel?.();
      topologyStream?.destroy?.();
      for (const service of [
        hal,
        scope,
        clients.machine,
        clients.program,
        clients.health,
      ]) {
        (service as unknown as { close: () => void }).close();
      }
    },
  };
  return client;
}

export function classifyGrpcError(error: unknown): InspectorErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/resource.?exhausted|already active|already acquired/i.test(message))
    return "SCOPE_CONFLICT";
  if (/invalid|out of range|failed precondition/i.test(message))
    return "SCOPE_INVALID_SOURCE";
  return "SCOPE_UNAVAILABLE";
}
