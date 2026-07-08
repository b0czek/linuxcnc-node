/**
 * LinuxCNC Core Protocol Definition
 *
 * Defines the typed contract for LinuxCNC communication over AppBus.
 * Wraps StatChannel, CommandChannel, and ErrorChannel.
 */

import type { ChannelProtocol } from "@edenapp/types";
import type {
  LinuxCNCStat,
  LinuxCNCStatPaths,
  LinuxCNCError,
  RcsStatus,
  TaskMode,
  TaskState,
  TrajMode,
  DebugFlags,
  ToolEntry,
  RecursivePartial,
  StatChange,
  NativeCommandName,
} from "@linuxcnc-node/types";

// ============================================================================
// Types (re-export for convenience)
// ============================================================================

export type {
  LinuxCNCStat,
  LinuxCNCStatPaths,
  LinuxCNCError,
  RcsStatus,
  TaskMode,
  TaskState,
  TrajMode,
  DebugFlags,
  ToolEntry,
  StatChange,
  NativeCommandName,
};

export type CommandTracking = "acceptance" | "completion";

export interface CommandAccepted {
  status: RcsStatus.DONE;
  serial: number | null;
}

// ============================================================================
// Protocol Definition
// ============================================================================

/**
 * Protocol for LinuxCNC core operations over AppBus.
 */
export interface LinuxCNCProtocol extends ChannelProtocol {
  hostMessages: {
    /** Flat delta: only changed paths with their new values */
    "stat-delta": {
      /** Changed paths and values */
      changes: StatChange[];
      /** Monotonic cursor for sync verification */
      cursor: number;
      timestamp: number;
    };

    /** Error/message from LinuxCNC */
    "error-channel-event": LinuxCNCError;

    /** Backend error */
    error: {
      code: string;
      message: string;
    };

    /** Raw V2 command completed after initial LinuxCNC acceptance */
    "cmd-v2/completed": {
      operationId: string;
      status: RcsStatus;
      serial: number | null;
    };

    /** Raw V2 command tracking failed after initial request submission */
    "cmd-v2/error": {
      operationId: string;
      message: string;
      serial?: number | null;
    };
  };

  peerMessages: {};

  hostHandles: {
    // =========================================================================
    // STAT: Status monitoring
    // =========================================================================

    /**
     * Get full LinuxCNC stat snapshot.
     * @returns Full stat plus current cursor
     */
    "stat/sync": {
      args: {};
      result: {
        stat: LinuxCNCStat;
        cursor: number;
      };
    };

    /** Get specific stat value by path */
    "stat/get-value": {
      args: { path: LinuxCNCStatPaths };
      result: { value: unknown };
    };

    // =========================================================================
    // COMMAND V2: Raw sent-command transport
    // =========================================================================

    /**
     * Send a native command by method name and tuple arguments.
     * Resolves when LinuxCNC echo-serial acceptance is observed. If completion
     * tracking is requested, completion/error is emitted later to the owner
     * connection as cmd-v2/completed or cmd-v2/error.
     */
    "cmd-v2/send": {
      args: {
        operationId: string;
        name: NativeCommandName;
        args?: unknown[];
        tracking?: CommandTracking;
        completionTimeout?: number;
      };
      result: CommandAccepted;
    };

    // =========================================================================
    // COMMAND: Task control
    // =========================================================================

    /** Set task mode (MDI, MANUAL, AUTO) */
    "cmd/set-task-mode": {
      args: { mode: TaskMode };
      result: RcsStatus;
    };

    /** Set machine state (ESTOP, ESTOP_RESET, OFF, ON) */
    "cmd/set-state": {
      args: { state: TaskState };
      result: RcsStatus;
    };

    /** Execute MDI command */
    "cmd/mdi": {
      args: { command: string };
      result: RcsStatus;
    };

    /** Stop an active AUTO program while preserving it for RUN or RESUME */
    "cmd/stop": {
      args: {};
      result: RcsStatus;
    };

    /** Abort current task */
    "cmd/abort": {
      args: {};
      result: RcsStatus;
    };

    /** Sync VAR file to disk */
    "cmd/task-plan-synch": {
      args: {};
      result: RcsStatus;
    };

    /** Reset G-code interpreter */
    "cmd/reset-interpreter": {
      args: {};
      result: RcsStatus;
    };

    // =========================================================================
    // COMMAND: Program control
    // =========================================================================

    /** Open G-code program file */
    "cmd/program-open": {
      args: { filePath: string };
      result: RcsStatus;
    };

    /** Close the currently loaded G-code program */
    "cmd/program-close": {
      args: {};
      result: RcsStatus;
    };

    /** Run program from line */
    "cmd/program-run": {
      args: { startLine?: number };
      result: RcsStatus;
    };

    /** Pause program execution */
    "cmd/program-pause": {
      args: {};
      result: RcsStatus;
    };

    /** Resume paused program */
    "cmd/program-resume": {
      args: {};
      result: RcsStatus;
    };

    /** Step one line */
    "cmd/program-step": {
      args: {};
      result: RcsStatus;
    };

    /** Reverse execution direction */
    "cmd/program-reverse": {
      args: {};
      result: RcsStatus;
    };

    /** Forward execution direction */
    "cmd/program-forward": {
      args: {};
      result: RcsStatus;
    };

    // =========================================================================
    // COMMAND: Motion control
    // =========================================================================

    /** Set feedrate override scale (1.0 = 100%) */
    "cmd/set-feed-rate": {
      args: { scale: number };
      result: RcsStatus;
    };

    /** Set rapid override scale (1.0 = 100%) */
    "cmd/set-rapid-rate": {
      args: { scale: number };
      result: RcsStatus;
    };

    /** Set max trajectory velocity */
    "cmd/set-max-velocity": {
      args: { velocity: number };
      result: RcsStatus;
    };

    /** Set trajectory mode (FREE, COORD, TELEOP) */
    "cmd/set-traj-mode": {
      args: { mode: TrajMode };
      result: RcsStatus;
    };

    /** Enable/disable teleop mode */
    "cmd/teleop-enable": {
      args: { enable: boolean };
      result: RcsStatus;
    };

    /** Enable/disable feedrate override */
    "cmd/set-feed-override-enable": {
      args: { enable: boolean };
      result: RcsStatus;
    };

    /** Enable/disable feed hold */
    "cmd/set-feed-hold-enable": {
      args: { enable: boolean };
      result: RcsStatus;
    };

    /** Enable/disable adaptive feed */
    "cmd/set-adaptive-feed-enable": {
      args: { enable: boolean };
      result: RcsStatus;
    };

    // =========================================================================
    // COMMAND: Jogging
    // =========================================================================

    /** Start continuous jog */
    "cmd/jog-continuous": {
      args: { axis: number; speed: number; isJoint?: boolean };
      result: RcsStatus;
    };

    /** Jog a fixed increment */
    "cmd/jog-increment": {
      args: {
        axis: number;
        speed: number;
        increment: number;
        isJoint?: boolean;
      };
      result: RcsStatus;
    };

    /** Stop jogging */
    "cmd/jog-stop": {
      args: { axis: number; isJoint?: boolean };
      result: RcsStatus;
    };

    // =========================================================================
    // COMMAND: Homing
    // =========================================================================

    /** Home a joint (-1 for all) */
    "cmd/home": {
      args: { joint: number };
      result: RcsStatus;
    };

    /** Unhome a joint (-1 for all) */
    "cmd/unhome": {
      args: { joint: number };
      result: RcsStatus;
    };

    /** Set joint min position limit */
    "cmd/set-min-position-limit": {
      args: { joint: number; limit: number };
      result: RcsStatus;
    };

    /** Set joint max position limit */
    "cmd/set-max-position-limit": {
      args: { joint: number; limit: number };
      result: RcsStatus;
    };

    // =========================================================================
    // COMMAND: Spindle
    // =========================================================================

    /** Turn spindle on at RPM (positive=CW, negative=CCW) */
    "cmd/spindle-on": {
      args: { speed: number; spindle?: number; wait?: boolean };
      result: RcsStatus;
    };

    /** Turn spindle off */
    "cmd/spindle-off": {
      args: { spindle?: number };
      result: RcsStatus;
    };

    /** Set spindle override scale (1.0 = 100%) */
    "cmd/spindle-override": {
      args: { scale: number; spindle?: number };
      result: RcsStatus;
    };

    /** Engage/release spindle brake */
    "cmd/spindle-brake": {
      args: { engage: boolean; spindle?: number };
      result: RcsStatus;
    };

    /** Increase spindle speed */
    "cmd/spindle-increase": {
      args: { spindle?: number };
      result: RcsStatus;
    };

    /** Decrease spindle speed */
    "cmd/spindle-decrease": {
      args: { spindle?: number };
      result: RcsStatus;
    };

    /** Enable/disable spindle override */
    "cmd/set-spindle-override-enable": {
      args: { enable: boolean; spindle?: number };
      result: RcsStatus;
    };

    // =========================================================================
    // COMMAND: Coolant
    // =========================================================================

    /** Turn mist coolant on/off */
    "cmd/set-mist": {
      args: { on: boolean };
      result: RcsStatus;
    };

    /** Turn flood coolant on/off */
    "cmd/set-flood": {
      args: { on: boolean };
      result: RcsStatus;
    };

    // =========================================================================
    // COMMAND: Tool
    // =========================================================================

    /** Reload tool table from disk */
    "cmd/load-tool-table": {
      args: {};
      result: RcsStatus;
    };

    /** Set tool data */
    "cmd/set-tool": {
      args: { tool: RecursivePartial<ToolEntry> & { toolNo: number } };
      result: RcsStatus;
    };

    // =========================================================================
    // COMMAND: I/O
    // =========================================================================

    /** Set digital output pin */
    "cmd/set-digital-output": {
      args: { index: number; value: boolean };
      result: RcsStatus;
    };

    /** Set analog output value */
    "cmd/set-analog-output": {
      args: { index: number; value: number };
      result: RcsStatus;
    };

    // =========================================================================
    // COMMAND: Misc
    // =========================================================================

    /** Override soft limits for recovery */
    "cmd/override-limits": {
      args: {};
      result: RcsStatus;
    };

    /** Enable/disable optional stop (M1) */
    "cmd/set-optional-stop": {
      args: { enable: boolean };
      result: RcsStatus;
    };

    /** Enable/disable block delete (/) */
    "cmd/set-block-delete": {
      args: { enable: boolean };
      result: RcsStatus;
    };

    /** Set debug flags */
    "cmd/set-debug-level": {
      args: { level: DebugFlags };
      result: RcsStatus;
    };

    /** Send error to operator display */
    "cmd/send-operator-error": {
      args: { message: string };
      result: RcsStatus;
    };

    /** Send text to operator display */
    "cmd/send-operator-text": {
      args: { message: string };
      result: RcsStatus;
    };

    /** Send message to operator display */
    "cmd/send-operator-display": {
      args: { message: string };
      result: RcsStatus;
    };

    // =========================================================================
    // CONNECTION
    // =========================================================================

    /** Health check */
    ping: {
      args: {};
      result: { timestamp: number };
    };
  };

  peerHandles: {
    /** Host requests peer to confirm it's alive */
    "health-check": {
      args: {};
      result: { alive: boolean; timestamp: number };
    };
  };
}
