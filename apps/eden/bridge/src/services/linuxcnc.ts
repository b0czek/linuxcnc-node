/**
 * LinuxCNC Service
 *
 * Exposes LinuxCNC status monitoring and command execution via AppBus.
 * Implements LinuxCNCProtocol from @linuxcnc-node/eden-protocol.
 */

import {
  StatChannel,
  CommandChannel,
  CommandTransport,
  ErrorChannel,
} from "@linuxcnc-node/core";
import { StatChange } from "@linuxcnc-node/types";
import type { NativeCommandName } from "@linuxcnc-node/types";
import type { LinuxCNCProtocol } from "@linuxcnc-node/eden-protocol";
import type { HostConnection } from "@edenapp/types";
import delve from "dlv";
const SERVICE_NAME = "linuxcnc";

// Shared state across all connections
let statChannel: StatChannel | null = null;
let commandChannel: CommandChannel | null = null;
let commandTransport: CommandTransport | null = null;
let errorChannel: ErrorChannel | null = null;

// Connected clients
const connections = new Map<string, HostConnection<LinuxCNCProtocol>>();

/**
 * Broadcast stat delta to all connected clients
 */
function broadcastDelta(changes: StatChange[]): void {
  if (changes.length === 0 || !statChannel) return;

  const message = {
    changes,
    cursor: statChannel.getCursor(),
    timestamp: Date.now(),
  };

  for (const conn of connections.values()) {
    try {
      conn.send("stat-delta", message);
    } catch (err) {
      console.error("[LinuxCNC] Error sending delta:", err);
    }
  }
}

/**
 * Initialize the LinuxCNC service
 */
export function initLinuxCNCService(): void {
  // Create channels (shared across all connections)
  statChannel = new StatChannel({ pollInterval: 50 });
  commandChannel = new CommandChannel();
  commandTransport = new CommandTransport();
  errorChannel = new ErrorChannel({ pollInterval: 100 });

  // Listen to native delta updates from StatChannel
  statChannel.on("delta", broadcastDelta);

  // Forward error channel events
  errorChannel.on("message", (error) => {
    for (const conn of connections.values()) {
      try {
        conn.send("error-channel-event", error);
      } catch (err) {
        console.error("[LinuxCNC] Error forwarding error event:", err);
      }
    }
  });

  // Expose the service
  worker!.appBus.exposeService(
    SERVICE_NAME,
    (connection, { appId: clientAppId }) => {
      console.log(`[LinuxCNC] Client connected: ${clientAppId}`);

      const typedConn = connection as HostConnection<LinuxCNCProtocol>;
      connections.set(clientAppId, typedConn);

      // Handle disconnect
      connection.onClose(() => {
        console.log(`[LinuxCNC] Client disconnected: ${clientAppId}`);
        connections.delete(clientAppId);
      });

      // === STAT HANDLERS ===

      typedConn.handle("stat/sync", () => {
        const stat = statChannel!.get();
        if (!stat) {
          throw new Error("StatChannel not ready");
        }

        return {
          stat,
          cursor: statChannel!.getCursor(),
        };
      });

      typedConn.handle("stat/get-value", ({ path }) => {
        const stat = statChannel!.get();
        if (!stat) {
          throw new Error("StatChannel not ready");
        }
        return { value: delve(stat, path) };
      });

      // === COMMAND HANDLERS ===

      typedConn.handle(
        "cmd-v2/send",
        async ({ operationId, name, args, tracking, completionTimeout }) => {
          const handle = commandTransport!.send(
            name as NativeCommandName,
            args ?? [],
            { tracking, completionTimeout }
          );
          const accepted = await handle.accepted;

          if (handle.completed) {
            void handle.completed.then(
              (status) => {
                typedConn.send("cmd-v2/completed", {
                  operationId,
                  status,
                  serial: accepted.serial,
                });
              },
              (error: unknown) => {
                typedConn.send("cmd-v2/error", {
                  operationId,
                  message: errorMessage(error),
                  serial: accepted.serial,
                });
              }
            );
          }

          return accepted;
        }
      );

      typedConn.handle("cmd/set-task-mode", async ({ mode }) => {
        return commandChannel!.setTaskMode(mode);
      });

      typedConn.handle("cmd/set-state", async ({ state }) => {
        return commandChannel!.setState(state);
      });

      typedConn.handle("cmd/mdi", async ({ command }) => {
        return commandChannel!.mdi(command);
      });

      typedConn.handle("cmd/stop", async () => {
        return commandChannel!.stop();
      });

      typedConn.handle("cmd/abort", async () => {
        return commandChannel!.abortTask();
      });

      typedConn.handle("cmd/task-plan-synch", async () => {
        return commandChannel!.taskPlanSynch();
      });

      typedConn.handle("cmd/reset-interpreter", async () => {
        return commandChannel!.resetInterpreter();
      });

      // Program control
      typedConn.handle("cmd/program-open", async ({ filePath }) => {
        return commandChannel!.programOpen(filePath);
      });

      typedConn.handle("cmd/program-close", async () => {
        return commandChannel!.programClose();
      });

      typedConn.handle("cmd/program-run", async ({ startLine }) => {
        return commandChannel!.runProgram(startLine ?? 0);
      });

      typedConn.handle("cmd/program-pause", async () => {
        return commandChannel!.pauseProgram();
      });

      typedConn.handle("cmd/program-resume", async () => {
        return commandChannel!.resumeProgram();
      });

      typedConn.handle("cmd/program-step", async () => {
        return commandChannel!.stepProgram();
      });

      typedConn.handle("cmd/program-reverse", async () => {
        return commandChannel!.reverseProgram();
      });

      typedConn.handle("cmd/program-forward", async () => {
        return commandChannel!.forwardProgram();
      });

      // Motion control
      typedConn.handle("cmd/set-feed-rate", async ({ scale }) => {
        return commandChannel!.setFeedRate(scale);
      });

      typedConn.handle("cmd/set-rapid-rate", async ({ scale }) => {
        return commandChannel!.setRapidRate(scale);
      });

      typedConn.handle("cmd/set-max-velocity", async ({ velocity }) => {
        return commandChannel!.setMaxVelocity(velocity);
      });

      typedConn.handle("cmd/set-traj-mode", async ({ mode }) => {
        return commandChannel!.setTrajMode(mode);
      });

      typedConn.handle("cmd/teleop-enable", async ({ enable }) => {
        return commandChannel!.teleopEnable(enable);
      });

      typedConn.handle("cmd/set-feed-override-enable", async ({ enable }) => {
        return commandChannel!.setFeedOverrideEnable(enable);
      });

      typedConn.handle("cmd/set-feed-hold-enable", async ({ enable }) => {
        return commandChannel!.setFeedHoldEnable(enable);
      });

      typedConn.handle("cmd/set-adaptive-feed-enable", async ({ enable }) => {
        return commandChannel!.setAdaptiveFeedEnable(enable);
      });

      // Jogging - note: CommandChannel uses (axis, isJoint, speed) order
      typedConn.handle(
        "cmd/jog-continuous",
        async ({ axis, speed, isJoint }) => {
          return commandChannel!.jogContinuous(axis, isJoint ?? false, speed);
        }
      );

      typedConn.handle(
        "cmd/jog-increment",
        async ({ axis, speed, increment, isJoint }) => {
          return commandChannel!.jogIncrement(
            axis,
            isJoint ?? false,
            speed,
            increment
          );
        }
      );

      typedConn.handle("cmd/jog-stop", async ({ axis, isJoint }) => {
        return commandChannel!.jogStop(axis, isJoint ?? false);
      });

      // Homing
      typedConn.handle("cmd/home", async ({ joint }) => {
        return commandChannel!.homeJoint(joint);
      });

      typedConn.handle("cmd/unhome", async ({ joint }) => {
        return commandChannel!.unhomeJoint(joint);
      });

      typedConn.handle(
        "cmd/set-min-position-limit",
        async ({ joint, limit }) => {
          return commandChannel!.setMinPositionLimit(joint, limit);
        }
      );

      typedConn.handle(
        "cmd/set-max-position-limit",
        async ({ joint, limit }) => {
          return commandChannel!.setMaxPositionLimit(joint, limit);
        }
      );

      // Spindle
      typedConn.handle("cmd/spindle-on", async ({ speed, spindle, wait }) => {
        return commandChannel!.spindleOn(speed, spindle ?? 0, wait ?? false);
      });

      typedConn.handle("cmd/spindle-off", async ({ spindle }) => {
        return commandChannel!.spindleOff(spindle ?? 0);
      });

      typedConn.handle("cmd/spindle-override", async ({ scale, spindle }) => {
        return commandChannel!.setSpindleOverride(scale, spindle ?? 0);
      });

      typedConn.handle("cmd/spindle-brake", async ({ engage, spindle }) => {
        return commandChannel!.spindleBrake(engage, spindle ?? 0);
      });

      typedConn.handle("cmd/spindle-increase", async ({ spindle }) => {
        return commandChannel!.spindleIncrease(spindle ?? 0);
      });

      typedConn.handle("cmd/spindle-decrease", async ({ spindle }) => {
        return commandChannel!.spindleDecrease(spindle ?? 0);
      });

      typedConn.handle(
        "cmd/set-spindle-override-enable",
        async ({ enable, spindle }) => {
          return commandChannel!.setSpindleOverrideEnable(enable, spindle ?? 0);
        }
      );

      // Coolant
      typedConn.handle("cmd/set-mist", async ({ on }) => {
        return commandChannel!.setMist(on);
      });

      typedConn.handle("cmd/set-flood", async ({ on }) => {
        return commandChannel!.setFlood(on);
      });

      // Tool
      typedConn.handle("cmd/load-tool-table", async () => {
        return commandChannel!.loadToolTable();
      });

      typedConn.handle("cmd/set-tool", async ({ tool }) => {
        return commandChannel!.setTool(tool);
      });

      // I/O
      typedConn.handle("cmd/set-digital-output", async ({ index, value }) => {
        return commandChannel!.setDigitalOutput(index, value);
      });

      typedConn.handle("cmd/set-analog-output", async ({ index, value }) => {
        return commandChannel!.setAnalogOutput(index, value);
      });

      // Misc
      typedConn.handle("cmd/override-limits", async () => {
        return commandChannel!.overrideLimits();
      });

      typedConn.handle("cmd/set-optional-stop", async ({ enable }) => {
        return commandChannel!.setOptionalStop(enable);
      });

      typedConn.handle("cmd/set-block-delete", async ({ enable }) => {
        return commandChannel!.setBlockDelete(enable);
      });

      typedConn.handle("cmd/set-debug-level", async ({ level }) => {
        return commandChannel!.setDebugLevel(level);
      });

      typedConn.handle("cmd/send-operator-error", async ({ message }) => {
        return commandChannel!.sendOperatorError(message);
      });

      typedConn.handle("cmd/send-operator-text", async ({ message }) => {
        return commandChannel!.sendOperatorText(message);
      });

      typedConn.handle("cmd/send-operator-display", async ({ message }) => {
        return commandChannel!.sendOperatorDisplay(message);
      });

      // Connection
      typedConn.handle("ping", () => {
        return { timestamp: Date.now() };
      });
    },
    { description: "LinuxCNC status monitoring and command execution" }
  );

  console.log(`[LinuxCNC] Service exposed as '${SERVICE_NAME}'`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
