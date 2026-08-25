import type { ChannelProtocol } from "@edenapp/types/ipc";
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

export type InspectorErrorCode =
  | "DISCONNECTED"
  | "NOT_FOUND"
  | "NOT_WRITABLE"
  | "INVALID_VALUE"
  | "SCOPE_CONFLICT"
  | "SCOPE_UNAVAILABLE"
  | "SCOPE_INVALID_SOURCE"
  | "SCOPE_NOT_RUNNING"
  | "ABI_MISMATCH"
  | "INTERNAL";

export type RpcResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: { code: InspectorErrorCode; message: string; detail?: string };
    };

export interface TopologySnapshot {
  revision: number;
  components: HalComponentInfo[];
  pins: HalPinInfo[];
  params: HalParamInfo[];
  signals: HalSignalInfo[];
  functions: HalFunctionInfo[];
  threads: HalThreadInfo[];
}

export interface HalValueSlot {
  slot: number;
  ref: HalItemRef;
  type: HalType;
}

export interface HalValueSubscriptionDescriptor {
  revision: number;
  samplePeriodMs: number;
  slots: HalValueSlot[];
  websocketUrl?: string;
}

export type ScopeRunMode = "stop" | "run" | "single" | "roll";

export interface ScopeRollFrame {
  generation: number;
  batch: ScopeCaptureDelta;
}

export interface Bootstrap {
  connected: boolean;
  topology: TopologySnapshot | null;
  scope: ScopeStatus | null;
  scopeRunMode: ScopeRunMode;
}

export interface HalInspectorProtocol extends ChannelProtocol {
  hostMessages: {
    "connection/state": { connected: boolean; message?: string };
    "topology/changed": TopologySnapshot;
    "scope/status": ScopeStatus;
    "scope/run-mode": { mode: ScopeRunMode };
    "scope/capture": { id: number; capture: ScopeCapture; skipped: number };
    "scope/roll-batch": ScopeRollFrame & {
      id: number;
      skipped: number;
    };
    error: { code: InspectorErrorCode; message: string };
  };
  peerMessages: {
    "ui/state": { visible: boolean; scopeExpanded: boolean };
    "scope/capture-ack": { id: number };
  };
  hostHandles: {
    "bootstrap/get": {
      args: Record<string, never>;
      result: RpcResult<Bootstrap>;
    };
    "topology/refresh": {
      args: Record<string, never>;
      result: RpcResult<TopologySnapshot>;
    };
    "subscriptions/set": {
      args: { refs: HalItemRef[]; intervalMs: number };
      result: RpcResult<HalValueSubscriptionDescriptor | null>;
    };
    "item/write": {
      args: { ref: HalItemRef; value: string | number | boolean };
      result: RpcResult<{ value: HalValue }>;
    };
    "scope/ensure": {
      args: { preferredBufferSize?: number };
      result: RpcResult<ScopeStatus>;
    };
    "scope/configure": {
      args: ScopeAcquisitionConfig;
      result: RpcResult<ScopeStatus>;
    };
    "scope/run": {
      args: { mode: Exclude<ScopeRunMode, "stop"> };
      result: RpcResult<ScopeStatus>;
    };
    "scope/stop": {
      args: Record<string, never>;
      result: RpcResult<ScopeStatus>;
    };
    "scope/force-trigger": {
      args: Record<string, never>;
      result: RpcResult<ScopeStatus>;
    };
  };
  peerHandles: Record<string, never>;
}
