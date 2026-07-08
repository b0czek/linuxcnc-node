/**
 * HAL Protocol Definition
 *
 * Defines the typed contract for HAL (Hardware Abstraction Layer) communication.
 *
 * This protocol enables real-time monitoring and control of LinuxCNC HAL.
 */

import type { ChannelProtocol } from "@edenapp/types";
import type {
  HalType,
  HalPinDir,
  HalParamDir,
  RtapiMsgLevel,
  HalPinInfo,
  HalParamInfo,
  HalSignalInfo,
} from "@linuxcnc-node/types";

// ============================================================================
// HAL Types (re-export for convenience)
// ============================================================================

export type {
  HalType,
  HalPinDir,
  HalParamDir,
  RtapiMsgLevel,
  HalPinInfo,
  HalParamInfo,
  HalSignalInfo,
};

export type HalValue = boolean | number;

/** Delta update structure for HAL items */
export interface HalDelta {
  /** Changed items as flat array of name-value pairs */
  changes: Array<{ name: string; value: HalValue }>;
  /** Monotonic cursor for sync verification */
  cursor: number;
  /** Timestamp of update */
  timestamp: number;
}

// ============================================================================
// Protocol Definition
// ============================================================================
/**
 * Protocol for HAL communication over AppBus.
 *
 * Host = HAL service provider (manages HAL component)
 * Peer = HAL service consumer (controls/monitors HAL)
 *
 * Each connection is bound to a single HAL component. The component is created
 * when component/init is called and disposed when the connection closes.
 */
export interface HalProtocol extends ChannelProtocol {
  // -------------------------------------------------------------------------
  // Messages sent by host, received by peer
  // -------------------------------------------------------------------------
  hostMessages: {
    /** HAL component is ready */
    "hal-ready": {
      componentName: string;
      prefix: string;
    };

    /** Flat delta: only changed items with their new values */
    "items-delta": HalDelta;

    /** Error occurred in backend */
    error: {
      code: string;
      message: string;
    };
  };

  // -------------------------------------------------------------------------
  // Messages sent by peer, received by host
  // -------------------------------------------------------------------------
  peerMessages: {};

  // -------------------------------------------------------------------------
  // Requests that peer sends, host handles
  // -------------------------------------------------------------------------
  hostHandles: {
    // Component Operations (bound to this connection)
    /** Initialize the HAL component for this connection. Must be called first. */
    "component/init": {
      args: { name: string; prefix?: string };
      result: { success: boolean; componentName: string; error?: string };
    };

    /** Mark the bound component as ready */
    "component/ready": {
      args: {};
      result: { success: boolean; error?: string };
    };

    /** Mark the bound component as not ready */
    "component/unready": {
      args: {};
      result: { success: boolean; error?: string };
    };

    /** Create a pin on the bound component */
    "pin/create": {
      args: {
        name: string;
        type: HalType;
        direction: HalPinDir;
      };
      result: { success: boolean; fullName: string; error?: string };
    };

    /** Create a parameter on the bound component */
    "param/create": {
      args: {
        name: string;
        type: HalType;
        direction: HalParamDir;
      };
      result: { success: boolean; fullName: string; error?: string };
    };

    /** Get value of a pin or parameter on the bound component */
    "item/get-value": {
      args: { name: string };
      result: { value: HalValue };
    };

    /** Set value of a pin or parameter on the bound component */
    "item/set-value": {
      args: { name: string; value: HalValue };
      result: { success: boolean; error?: string };
    };

    /**
     * Get all current item values.
     * @returns All item values plus current cursor
     */
    "items/sync": {
      args: {};
      result: {
        /** All current item values */
        items: Record<string, HalValue>;
        /** Current cursor for delta updates */
        cursor: number;
      };
    };

    // =========================================================================
    // GLOBAL: System-wide HAL operations (not tied to bound component)
    // =========================================================================

    /** Check if any component exists by name */
    "global/component-exists": {
      args: { componentName: string };
      result: { exists: boolean };
    };

    /** Check if any component is ready by name */
    "global/component-is-ready": {
      args: { componentName: string };
      result: { ready: boolean };
    };

    /** Create a new HAL signal */
    "global/signal-create": {
      args: { name: string; type: HalType };
      result: { success: boolean; error?: string };
    };

    /** Get value of any signal by name */
    "global/signal-get-value": {
      args: { signalName: string };
      result: { value: HalValue };
    };

    /** Set value of any signal by name */
    "global/signal-set-value": {
      args: { signalName: string; value: HalValue };
      result: { success: boolean; error?: string };
    };

    /** Connect any pin to a signal */
    "global/signal-connect": {
      args: { pinName: string; signalName: string };
      result: { success: boolean; error?: string };
    };

    /** Disconnect any pin from its signal */
    "global/signal-disconnect": {
      args: { pinName: string };
      result: { success: boolean; error?: string };
    };

    /** Check if any pin has a writer */
    "global/pin-has-writer": {
      args: { pinName: string };
      result: { hasWriter: boolean };
    };

    /** Get value of any pin, param, or signal by full name */
    "global/get-value": {
      args: { name: string };
      result: { value: HalValue; type: "pin" | "param" | "signal" };
    };

    /** List all pins in HAL */
    "global/list-pins": {
      args: { filter?: string };
      result: { pins: HalPinInfo[] };
    };

    /** List all parameters in HAL */
    "global/list-params": {
      args: { filter?: string };
      result: { params: HalParamInfo[] };
    };

    /** List all signals in HAL */
    "global/list-signals": {
      args: { filter?: string };
      result: { signals: HalSignalInfo[] };
    };

    /** List all pins, params, and signals in HAL */
    "global/list-all": {
      args: {};
      result: {
        pins: HalPinInfo[];
        params: HalParamInfo[];
        signals: HalSignalInfo[];
      };
    };

    /** Get RTAPI message level */
    "global/msg-level-get": {
      args: {};
      result: { level: RtapiMsgLevel };
    };

    /** Set RTAPI message level */
    "global/msg-level-set": {
      args: { level: RtapiMsgLevel };
      result: { success: boolean; previousLevel: RtapiMsgLevel };
    };

    // =========================================================================
    // CONNECTION: Status and health for this connection
    // =========================================================================

    /** Health check */
    ping: {
      args: {};
      result: { timestamp: number };
    };

    /** Get backend status for this connection */
    "get-status": {
      args: {};
      result: {
        connected: boolean;
        componentName: string;
        componentReady: boolean;
        pinCount: number;
        paramCount: number;
        uptime: number;
      };
    };
  };

  // -------------------------------------------------------------------------
  // Requests that host sends, peer handles
  // -------------------------------------------------------------------------
  peerHandles: {
    /** Host requests peer to confirm it's alive */
    "health-check": {
      args: {};
      result: { alive: boolean; timestamp: number };
    };
  };
}
