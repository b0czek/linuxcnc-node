/**
 * HAL Service
 *
 * Exposes HAL component management and I/O access via AppBus.
 * Each connection gets its own HalComponent lifecycle.
 * Implements HalProtocol from @linuxcnc-node/eden-protocol.
 */

import {
  HalComponent,
  Pin,
  Param,
  getMsgLevel,
  setMsgLevel,
  getValue,
  getInfoPins,
  getInfoSignals,
  getInfoParams,
  newSignal,
  pinHasWriter,
  setSignalValue,
} from "@linuxcnc-node/hal";
import type { HalType, HalPinDir, HalParamDir } from "@linuxcnc-node/types";
import type { HalProtocol, HalValue, HalDelta } from "@linuxcnc-node/eden-protocol";
import type { HostConnection } from "@edenapp/types";
import picomatch from "picomatch";

const SERVICE_NAME = "hal";

interface ConnectionState {
  component: HalComponent | null;
  pins: Map<string, Pin>;
  params: Map<string, Param>;
  lastValues: Map<string, HalValue>;
  cursor: number;
  pollInterval: NodeJS.Timeout | null;
}

/**
 * Initialize the HAL service
 */
export function initHalService(): void {
  worker!.appBus.exposeService(
    SERVICE_NAME,
    (connection, { appId: clientAppId }) => {
      console.log(`[HAL] Client connected: ${clientAppId}`);

      const typedConn = connection as HostConnection<HalProtocol>;

      // Per-connection state
      const state: ConnectionState = {
        component: null,
        pins: new Map(),
        params: new Map(),
        lastValues: new Map(),
        cursor: 0,
        pollInterval: null,
      };

      // Clean up on disconnect
      connection.onClose(() => {
        console.log(`[HAL] Client disconnected: ${clientAppId}`);
        if (state.pollInterval) {
          clearInterval(state.pollInterval);
        }
        if (state.component) {
          state.component.dispose();
        }
      });

      // Start polling for value changes
      function startPolling(): void {
        if (state.pollInterval) return;

        state.pollInterval = setInterval(() => {
          if (!state.component) return;

          const changes: Array<{ name: string; value: HalValue }> = [];

          // Check all pins and params for changes
          for (const [name, pin] of state.pins) {
            const value = pin.getValue();
            const lastValue = state.lastValues.get(name);
            if (value !== lastValue) {
              changes.push({ name, value });
              state.lastValues.set(name, value);
            }
          }

          for (const [name, param] of state.params) {
            const value = param.getValue();
            const lastValue = state.lastValues.get(name);
            if (value !== lastValue) {
              changes.push({ name, value });
              state.lastValues.set(name, value);
            }
          }

          if (changes.length > 0) {
            state.cursor++;
            const delta: HalDelta = {
              changes,
              cursor: state.cursor,
              timestamp: Date.now(),
            };
            try {
              typedConn.send("items-delta", delta);
            } catch (err) {
              console.error("[HAL] Error sending delta:", err);
            }
          }
        }, 10); // 10ms polling interval
      }

      // === COMPONENT HANDLERS ===

      typedConn.handle("component/init", ({ name, prefix }) => {
        if (state.component) {
          return {
            success: false,
            componentName: "",
            error: "Component already initialized for this connection",
          };
        }

        try {
          state.component = new HalComponent(name, prefix);
          return {
            success: true,
            componentName: state.component.name,
          };
        } catch (err) {
          return {
            success: false,
            componentName: "",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      typedConn.handle("component/ready", () => {
        if (!state.component) {
          return { success: false, error: "Component not initialized" };
        }

        try {
          state.component.ready();
          startPolling();

          typedConn.send("hal-ready", {
            componentName: state.component.name,
            prefix: state.component.prefix,
          });

          return { success: true };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      typedConn.handle("component/unready", () => {
        if (!state.component) {
          return { success: false, error: "Component not initialized" };
        }

        try {
          state.component.unready();
          return { success: true };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      // === PIN/PARAM HANDLERS ===

      typedConn.handle("pin/create", ({ name, type, direction }) => {
        if (!state.component) {
          return {
            success: false,
            fullName: "",
            error: "Component not initialized",
          };
        }

        try {
          const pin = state.component.newPin(name, type, direction);
          state.pins.set(name, pin);
          state.lastValues.set(name, pin.getValue());

          return {
            success: true,
            fullName: `${state.component!.prefix}.${pin.name}`,
          };
        } catch (err) {
          return {
            success: false,
            fullName: "",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      typedConn.handle("param/create", ({ name, type, direction }) => {
        if (!state.component) {
          return {
            success: false,
            fullName: "",
            error: "Component not initialized",
          };
        }

        try {
          const param = state.component.newParam(name, type, direction);
          state.params.set(name, param);
          state.lastValues.set(name, param.getValue());

          return {
            success: true,
            fullName: `${state.component!.prefix}.${param.name}`,
          };
        } catch (err) {
          return {
            success: false,
            fullName: "",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      typedConn.handle("item/get-value", ({ name }) => {
        if (!state.component) {
          throw new Error("Component not initialized");
        }

        const value = state.component.getValue(name);
        return { value };
      });

      typedConn.handle("item/set-value", ({ name, value }) => {
        if (!state.component) {
          return { success: false, error: "Component not initialized" };
        }

        try {
          state.component.setValue(name, value);
          state.lastValues.set(name, value);
          return { success: true };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      typedConn.handle("items/sync", () => {
        if (!state.component) {
          throw new Error("Component not initialized");
        }

        // Build current items snapshot
        const items: Record<string, HalValue> = {};
        for (const [name, pin] of state.pins) {
          items[name] = pin.getValue();
        }
        for (const [name, param] of state.params) {
          items[name] = param.getValue();
        }

        return {
          items,
          cursor: state.cursor,
        };
      });

      // === GLOBAL HANDLERS ===

      typedConn.handle("global/component-exists", ({ componentName }) => {
        return { exists: HalComponent.exists(componentName) };
      });

      typedConn.handle("global/component-is-ready", ({ componentName }) => {
        return { ready: HalComponent.isReady(componentName) };
      });

      typedConn.handle("global/signal-create", ({ name, type }) => {
        try {
          newSignal(name, type);
          return { success: true };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      typedConn.handle("global/signal-get-value", ({ signalName }) => {
        const value = getValue(signalName);
        return { value };
      });

      typedConn.handle("global/signal-set-value", ({ signalName, value }) => {
        try {
          setSignalValue(signalName, value);
          return { success: true };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      typedConn.handle("global/signal-connect", ({ pinName, signalName }) => {
        // This would need net/connect functionality from hal
        // For now, return not implemented
        return { success: false, error: "Not implemented - use halcmd net" };
      });

      typedConn.handle("global/signal-disconnect", ({ pinName }) => {
        // This would need disconnect functionality from hal
        return {
          success: false,
          error: "Not implemented - use halcmd unlinkp",
        };
      });

      typedConn.handle("global/pin-has-writer", ({ pinName }) => {
        return { hasWriter: pinHasWriter(pinName) };
      });

      typedConn.handle("global/get-value", ({ name }) => {
        const value = getValue(name);
        // Determine type based on whether it's a pin, param, or signal
        // For simplicity, return "pin" - could be enhanced with proper detection
        return { value, type: "pin" as const };
      });

      typedConn.handle("global/list-pins", ({ filter }) => {
        let pins = getInfoPins();
        if (filter) {
          const isMatch = picomatch(filter);
          pins = pins.filter((p) => isMatch(p.name));
        }
        return { pins };
      });

      typedConn.handle("global/list-params", ({ filter }) => {
        let params = getInfoParams();
        if (filter) {
          const isMatch = picomatch(filter);
          params = params.filter((p) => isMatch(p.name));
        }
        return { params };
      });

      typedConn.handle("global/list-signals", ({ filter }) => {
        let signals = getInfoSignals();
        if (filter) {
          const isMatch = picomatch(filter);
          signals = signals.filter((s) => isMatch(s.name));
        }
        return { signals };
      });

      typedConn.handle("global/list-all", () => {
        return {
          pins: getInfoPins(),
          params: getInfoParams(),
          signals: getInfoSignals(),
        };
      });

      typedConn.handle("global/msg-level-get", () => {
        return { level: getMsgLevel() };
      });

      typedConn.handle("global/msg-level-set", ({ level }) => {
        const previousLevel = getMsgLevel();
        setMsgLevel(level);
        return { success: true, previousLevel };
      });

      // === CONNECTION HANDLERS ===

      typedConn.handle("ping", () => {
        return { timestamp: Date.now() };
      });

      typedConn.handle("get-status", () => {
        return {
          connected: true,
          componentName: state.component?.name ?? "",
          componentReady: state.component
            ? HalComponent.isReady(state.component.name)
            : false,
          pinCount: state.pins.size,
          paramCount: state.params.size,
          uptime: process.uptime(),
        };
      });
    },
    { description: "HAL component management and I/O access" }
  );

  console.log(`[HAL] Service exposed as '${SERVICE_NAME}'`);
}
