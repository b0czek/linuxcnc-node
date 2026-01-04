/**
 * G-Code Parser Module
 *
 * Provides async G-code file parsing using LinuxCNC's rs274ngc interpreter.
 */

import { GCodeParseResult, ParseOptions, ParseProgress } from "@linuxcnc-node/types";

// Lazy-loaded native addon (loaded on first parseGCode call)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let addon: any = null;

function loadAddon() {
  if (addon) return addon;

  const paths = [
    "../build/Release/gcode_addon.node", // Installed in node_modules (path relative to dist/)
    "../../build/Release/gcode_addon.node", // Local development (path relative to src/ts/)
  ];

  for (const path of paths) {
    try {
      addon = require(path);
      return addon;
    } catch {
      // Try next path
    }
  }

  throw new Error(
    `Failed to load gcode_addon.node. Tried paths:\n` +
      paths.map((p) => `  - ${p}`).join("\n")
  );
}

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

  const nativeAddon = loadAddon();

  return new Promise<GCodeParseResult>((resolve, reject) => {
    const progressCallback =
      options.onProgress || ((_progress: ParseProgress) => {});
    const progressUpdates = options.progressUpdates ?? 40;

    nativeAddon.parseGCode(
      filepath,
      options.iniPath,
      progressUpdates,
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
