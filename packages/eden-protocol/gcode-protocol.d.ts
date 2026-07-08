/**
 * G-Code Protocol Definition
 *
 * Defines the typed contract for G-Code parsing using LinuxCNC's rs274ngc interpreter.
 */

import type { ChannelProtocol } from "@edenapp/types";
import type { GCodeParseResult, ParseProgress } from "@linuxcnc-node/types";

// ============================================================================
// G-Code Types (re-export for convenience)
// ============================================================================

export type { GCodeParseResult, ParseProgress };

// ============================================================================
// Protocol Definition
// ============================================================================

/**
 * Protocol for G-Code parsing over AppBus.
 */
export interface GCodeProtocol extends ChannelProtocol {
  hostMessages: {
    /** Parse progress update */
    "parse-progress": ParseProgress;

    /** Error occurred */
    error: {
      code: string;
      message: string;
    };
  };

  peerMessages: {};

  hostHandles: {
    /** Parse a G-code file */
    parse: {
      args: {
        filepath: string;
        iniPath: string;
        progressUpdates?: number;
      };
      result: GCodeParseResult;
    };

    ping: {
      args: {};
      result: { timestamp: number };
    };
  };

  peerHandles: {};
}
