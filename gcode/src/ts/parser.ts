/**
 * G-Code Parser Module
 *
 * Provides async G-code file parsing using LinuxCNC's rs274ngc interpreter.
 */

import {
  GCodeParseResult,
  ParseOptions,
  ParseProgress,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const addon = require("../../build/Release/gcode_addon.node");

/**
 * Parse a G-code file asynchronously.
 *
 * Uses LinuxCNC's rs274ngc interpreter to parse the G-code file and extract
 * a sequential list of operations suitable for graphics visualization.
 *
 * @param filepath - Path to the G-code file to parse (.ngc, .nc, .gcode, etc.)
 * @param options - Parse options including required INI path and optional progress callback
 * @returns Promise resolving to parse result with operations and extents
 * @throws Error if parsing fails (invalid G-code, file not found, etc.)
 *
 * @example
 * ```typescript
 * import { parseGCode, OperationType } from "@linuxcnc-node/gcode";
 *
 * const result = await parseGCode("/path/to/program.ngc", {
 *   iniPath: "/path/to/machine.ini",
 *   onProgress: (progress) => {
 *     console.log(`${progress.percent}% complete`);
 *   }
 * });
 *
 * for (const op of result.operations) {
 *   if (op.type === OperationType.FEED) {
 *     console.log(`Feed from (${op.start.x}, ${op.start.y}) to (${op.end.x}, ${op.end.y})`);
 *   }
 * }
 *
 * console.log(`Extents: X ${result.extents.min.x} to ${result.extents.max.x}`);
 * ```
 */
export async function parseGCode(
  filepath: string,
  options: ParseOptions
): Promise<GCodeParseResult> {
  if (!options.iniPath) {
    throw new Error("iniPath is required in ParseOptions");
  }

  return new Promise<GCodeParseResult>((resolve, reject) => {
    const progressCallback = options.onProgress || ((_progress: ParseProgress) => {});

    addon.parseGCode(
      filepath,
      options.iniPath,
      progressCallback,
      (error: Error | null, result: GCodeParseResult) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
}
