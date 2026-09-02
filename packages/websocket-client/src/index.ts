import { fromBinary } from "@bufbuild/protobuf";
import type {
  CutterCompensationMode,
  GCodeOperation,
  HalValue,
  OperationType,
  Plane,
  ProgramHandle,
  ProgramUnits,
} from "@linuxcnc-node/types";
import type { HalScalar } from "./generated/linuxcnc/v1/hal_pb.js";
import {
  type GCodeOperation as WireOperation,
  OperationType as WireOperationType,
} from "./generated/linuxcnc/v1/program_pb.js";
import {
  HalValueFrameSchema,
  PositionHistoryFrameSchema,
  ProgramPreviewEventSchema,
  FrameKind as WireFrameKind,
  ProgramPreviewErrorCode as WirePreviewErrorCode,
} from "./generated/linuxcnc/v1/websocket_pb.js";

export type FrameKind = "replacement" | "delta";
export interface PositionHistoryFrame {
  kind: FrameKind;
  generation: bigint;
  firstSequence: bigint;
  nextSequence: bigint;
  replacementCount: bigint;
  values: Float64Array;
}
export interface HalValueEntry {
  slot: number;
  value?: HalValue;
}
export interface HalValueFrame {
  kind: FrameKind;
  revision: bigint;
  sequence: bigint;
  entries: HalValueEntry[];
}
export interface ProgramPreviewProgress {
  bytesRead: bigint;
  totalBytes: bigint;
  percent: number;
  operationCount: bigint;
}
export interface ProgramPreviewSummary {
  extents: { min: Float64Array; max: Float64Array };
  operationCount: bigint;
}
export interface ProgramPreviewError {
  code: "invalid-entry" | "interpreter" | "internal" | "unspecified";
  message: string;
  lineNumber?: number;
}
export type ProgramPreviewEvent =
  | { type: "progress"; progress: ProgramPreviewProgress }
  | { type: "batch"; operations: GCodeOperation[] }
  | { type: "summary"; summary: ProgramPreviewSummary }
  | { type: "error"; error: ProgramPreviewError };

export interface SocketHandle {
  readonly socket: WebSocket;
  close(code?: number, reason?: string): void;
}
export type WebSocketFactory = (url: string) => WebSocket;
interface OpenOptions {
  signal?: AbortSignal;
  createWebSocket?: WebSocketFactory;
  onError?: (error: Error) => void;
  onClose?: (event: CloseEvent) => void;
}
export interface PositionHistoryOptions extends OpenOptions {
  onFrame(frame: PositionHistoryFrame): void;
}
export interface HalValuesOptions extends OpenOptions {
  onFrame(frame: HalValueFrame): void;
}
export interface ProgramPreviewOptions extends OpenOptions {
  entry: ProgramHandle;
  onEvent(event: ProgramPreviewEvent): void;
}

function websocketBase(base: string | URL): URL {
  const url = new URL(base.toString());
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:")
    throw new Error("WebSocket base URL must use http(s) or ws(s)");
  return url;
}
export function positionHistoryUrl(base: string | URL): string {
  const url = websocketBase(base);
  url.pathname = "/v1/position-history";
  url.search = "";
  url.hash = "";
  return url.toString();
}
export function halValuesUrl(base: string | URL, tokenOrPath: string): string {
  const url = websocketBase(base);
  url.pathname = tokenOrPath.startsWith("/v1/hal-values/")
    ? tokenOrPath
    : `/v1/hal-values/${encodeURIComponent(tokenOrPath)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
export function programPreviewUrl(
  base: string | URL,
  entry: ProgramHandle,
): string {
  const url = websocketBase(base);
  url.pathname = "/v1/program-preview";
  url.search = "";
  url.searchParams.set("workspace_id", entry.workspaceId);
  url.searchParams.set("relative_path", entry.relativePath);
  url.hash = "";
  return url.toString();
}

function bytes(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  return ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
}
function frameKind(value: WireFrameKind): FrameKind {
  if (value === WireFrameKind.REPLACEMENT) return "replacement";
  if (value === WireFrameKind.DELTA) return "delta";
  throw new Error("invalid protobuf frame kind");
}
function decodePositionHistoryFrame(
  value: ArrayBuffer | ArrayBufferView,
): PositionHistoryFrame {
  const frame = fromBinary(PositionHistoryFrameSchema, bytes(value));
  return {
    kind: frameKind(frame.kind),
    generation: frame.generation,
    firstSequence: frame.firstSequence,
    nextSequence: frame.nextSequence,
    replacementCount: BigInt(frame.replacementCount),
    values: new Float64Array(frame.values),
  };
}
function domainHalScalar(value: HalScalar | undefined): HalValue | undefined {
  return value?.value.case === undefined ? undefined : value.value.value;
}
function decodeHalValueFrame(
  value: ArrayBuffer | ArrayBufferView,
): HalValueFrame {
  const frame = fromBinary(HalValueFrameSchema, bytes(value));
  return {
    kind: frameKind(frame.kind),
    revision: frame.revision,
    sequence: frame.sequence,
    entries: frame.entries.map((entry) => {
      const value = domainHalScalar(entry.value);
      return value === undefined
        ? { slot: entry.slot }
        : { slot: entry.slot, value };
    }),
  };
}

const finite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
};
const position = (value?: { values: number[] }): Float64Array => {
  const values = value?.values ?? [];
  values.forEach((entry) => {
    finite(entry, "preview position coordinate");
  });
  return new Float64Array(values);
};
function domainOperation(operation: WireOperation): GCodeOperation {
  const pos = position(operation.pos);
  const data = operation.data;
  switch (operation.type) {
    case WireOperationType.TRAVERSE:
      return {
        type: WireOperationType.TRAVERSE as OperationType.TRAVERSE,
        lineNumber: operation.lineNumber,
        pos,
      };
    case WireOperationType.FEED:
      return {
        type: WireOperationType.FEED as OperationType.FEED,
        lineNumber: operation.lineNumber,
        pos,
      };
    case WireOperationType.ARC:
      if (data.case !== "arc") throw new Error("arc operation is missing data");
      return {
        type: WireOperationType.ARC as OperationType.ARC,
        lineNumber: operation.lineNumber,
        pos,
        plane: data.value.plane as Plane,
        arcData: {
          centerFirst: finite(data.value.centerFirst, "arc center"),
          centerSecond: finite(data.value.centerSecond, "arc center"),
          rotation: data.value.rotation,
          axisEndPoint: finite(data.value.axisEndPoint, "arc endpoint"),
        },
      };
    case WireOperationType.PROBE:
      return {
        type: WireOperationType.PROBE as OperationType.PROBE,
        lineNumber: operation.lineNumber,
        pos,
      };
    case WireOperationType.RIGID_TAP:
      if (data.case !== "rigidTap")
        throw new Error("rigid-tap operation is missing data");
      return {
        type: WireOperationType.RIGID_TAP as OperationType.RIGID_TAP,
        lineNumber: operation.lineNumber,
        pos: position(data.value.pos),
        scale: finite(data.value.scale, "rigid-tap scale"),
      };
    case WireOperationType.DWELL:
      if (data.case !== "dwell")
        throw new Error("dwell operation is missing data");
      return {
        type: WireOperationType.DWELL as OperationType.DWELL,
        pos,
        duration: finite(data.value.duration, "dwell duration"),
        plane: data.value.plane as Plane,
      };
    case WireOperationType.NURBS_G5:
      if (data.case !== "nurbsG5")
        throw new Error("G5 NURBS operation is missing data");
      return {
        type: WireOperationType.NURBS_G5 as OperationType.NURBS_G5,
        lineNumber: operation.lineNumber,
        pos,
        plane: data.value.plane as Plane,
        nurbsData: {
          order: data.value.order,
          controlPoints: data.value.controlPoints.map(({ x, y, weight }) => ({
            x: finite(x, "G5 control point"),
            y: finite(y, "G5 control point"),
            weight: finite(weight, "G5 control point weight"),
          })),
        },
      };
    case WireOperationType.NURBS_G6:
      if (data.case !== "nurbsG6")
        throw new Error("G6 NURBS operation is missing data");
      return {
        type: WireOperationType.NURBS_G6 as OperationType.NURBS_G6,
        lineNumber: operation.lineNumber,
        pos,
        plane: data.value.plane as Plane,
        nurbsData: {
          order: data.value.order,
          interpolationMethod: data.value.interpolationMethod,
          controlPoints: data.value.controlPoints.map(({ x, y, r, k }) => ({
            x: finite(x, "G6 control point"),
            y: finite(y, "G6 control point"),
            r: finite(r, "G6 control point R"),
            k: finite(k, "G6 control point knot"),
          })),
        },
      };
    case WireOperationType.UNITS_CHANGE:
      if (data.case !== "unitsChange")
        throw new Error("units-change operation is missing data");
      return {
        type: WireOperationType.UNITS_CHANGE as OperationType.UNITS_CHANGE,
        units: data.value.units as ProgramUnits,
      };
    case WireOperationType.PLANE_CHANGE:
      if (data.case !== "planeChange")
        throw new Error("plane-change operation is missing data");
      return {
        type: WireOperationType.PLANE_CHANGE as OperationType.PLANE_CHANGE,
        plane: data.value.plane as Plane,
      };
    case WireOperationType.G5X_OFFSET:
      if (data.case !== "g5xOffset")
        throw new Error("G5x-offset operation is missing data");
      return {
        type: WireOperationType.G5X_OFFSET as OperationType.G5X_OFFSET,
        origin: data.value.origin,
        offset: position(data.value.offset),
      };
    case WireOperationType.G92_OFFSET:
      if (data.case !== "g92Offset")
        throw new Error("G92-offset operation is missing data");
      return {
        type: WireOperationType.G92_OFFSET as OperationType.G92_OFFSET,
        offset: position(data.value.offset),
      };
    case WireOperationType.XY_ROTATION:
      if (data.case !== "xyRotation")
        throw new Error("XY-rotation operation is missing data");
      return {
        type: WireOperationType.XY_ROTATION as OperationType.XY_ROTATION,
        rotation: finite(data.value.rotation, "XY rotation"),
      };
    case WireOperationType.TOOL_OFFSET:
      if (data.case !== "toolOffset")
        throw new Error("tool-offset operation is missing data");
      return {
        type: WireOperationType.TOOL_OFFSET as OperationType.TOOL_OFFSET,
        offset: position(data.value.offset),
      };
    case WireOperationType.TOOL_CHANGE:
      if (data.case !== "toolChange")
        throw new Error("tool-change operation is missing data");
      return {
        type: WireOperationType.TOOL_CHANGE as OperationType.TOOL_CHANGE,
        toolNumber: data.value.toolNumber,
      };
    case WireOperationType.FEED_RATE_CHANGE:
      if (data.case !== "feedRateChange")
        throw new Error("feed-rate operation is missing data");
      return {
        type: WireOperationType.FEED_RATE_CHANGE as OperationType.FEED_RATE_CHANGE,
        feedRate: finite(data.value.feedRate, "feed rate"),
      };
    case WireOperationType.CUTTER_COMPENSATION_CHANGE:
      if (data.case !== "cutterCompensationChange")
        throw new Error("cutter-compensation operation is missing data");
      return {
        type: WireOperationType.CUTTER_COMPENSATION_CHANGE as OperationType.CUTTER_COMPENSATION_CHANGE,
        mode: data.value.mode as CutterCompensationMode,
      };
    default:
      throw new Error(`unknown G-code operation type ${operation.type}`);
  }
}
function decodeProgramPreviewEvent(
  value: ArrayBuffer | ArrayBufferView,
): ProgramPreviewEvent {
  const event = fromBinary(ProgramPreviewEventSchema, bytes(value)).event;
  if (event.case === "progress")
    return { type: "progress", progress: event.value };
  if (event.case === "batch")
    return {
      type: "batch",
      operations: event.value.operations.map(domainOperation),
    };
  if (event.case === "summary") {
    const min = position(event.value.extents?.min),
      max = position(event.value.extents?.max);
    if (min.length !== 3 || max.length !== 3)
      throw new Error("preview extents must contain three coordinates");
    return {
      type: "summary",
      summary: {
        extents: { min, max },
        operationCount: event.value.operationCount,
      },
    };
  }
  if (event.case === "error") {
    const code =
      event.value.code === WirePreviewErrorCode.INVALID_ENTRY
        ? "invalid-entry"
        : event.value.code === WirePreviewErrorCode.INTERPRETER
          ? "interpreter"
          : event.value.code === WirePreviewErrorCode.INTERNAL
            ? "internal"
            : "unspecified";
    return {
      type: "error",
      error: {
        code,
        message: event.value.message,
        ...(event.value.lineNumber === undefined
          ? {}
          : { lineNumber: event.value.lineNumber }),
      },
    };
  }
  throw new Error("program preview event has no payload");
}

function open<T>(
  url: string,
  decode: (value: ArrayBuffer | ArrayBufferView) => T,
  deliver: (value: T) => void,
  options: OpenOptions,
): SocketHandle {
  const socket = (options.createWebSocket ?? ((value) => new WebSocket(value)))(
    url,
  );
  socket.binaryType = "arraybuffer";
  let closed = false;
  const abort = () => {
    if (!closed) socket.close(1000, "aborted");
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  socket.addEventListener("message", (event) => {
    try {
      if (!(event.data instanceof ArrayBuffer))
        throw new Error("expected a binary WebSocket message");
      deliver(decode(event.data));
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      options.onError?.(failure);
      socket.close(1002, "malformed protobuf frame");
    }
  });
  socket.addEventListener("error", () =>
    options.onError?.(new Error("WebSocket transport error")),
  );
  socket.addEventListener("close", (event) => {
    closed = true;
    options.signal?.removeEventListener("abort", abort);
    options.onClose?.(event);
  });
  return {
    socket,
    close: (code = 1000, reason = "") => socket.close(code, reason),
  };
}
export function openPositionHistory(
  base: string | URL,
  options: PositionHistoryOptions,
): SocketHandle {
  return open(
    positionHistoryUrl(base),
    decodePositionHistoryFrame,
    options.onFrame,
    options,
  );
}
export function openHalValues(
  base: string | URL,
  tokenOrPath: string,
  options: HalValuesOptions,
): SocketHandle {
  return open(
    halValuesUrl(base, tokenOrPath),
    decodeHalValueFrame,
    options.onFrame,
    options,
  );
}
export function openProgramPreview(
  base: string | URL,
  options: ProgramPreviewOptions,
): SocketHandle {
  return open(
    programPreviewUrl(base, options.entry),
    decodeProgramPreviewEvent,
    options.onEvent,
    options,
  );
}
