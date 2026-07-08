/**
 * G-Code Parser Module
 *
 * Provides async G-code file parsing using LinuxCNC's rs274ngc interpreter.
 */

import { GCodeParseResult, ParseOptions, ParseProgress } from "@linuxcnc-node/types";

// Native addon - loaded immediately on module import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadAddon(): any {
  const paths = [
    "../build/Release/gcode_addon.node", // Installed in node_modules (path relative to dist/)
    "../../build/Release/gcode_addon.node", // Local development (path relative to src/ts/)
  ];

  for (const path of paths) {
    try {
      return require(path);
    } catch {
      // Try next path
    }
  }

  throw new Error(
    `Failed to load gcode_addon.node. Tried paths:\n` +
      paths.map((p) => `  - ${p}`).join("\n")
  );
}

const addon = loadAddon();

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
 * import { parseGCode } from "@linuxcnc-node/gcode";
 * import { OperationType, PositionIndex } from "@linuxcnc-node/types";
 *
 * const result = await parseGCode("/path/to/program.ngc", {
 *   iniPath: "/path/to/machine.ini",
 *   onProgress: (progress) => {
 *     console.log(`${progress.percent}% complete`);
 *   }
 * });
 *
 * const { X, Y } = PositionIndex;
 * for (const op of result.operations) {
 *   if (op.type === OperationType.FEED) {
 *     console.log(`Feed from (${op.pos[X]}, ${op.pos[Y]})`);
 *   }
 * }
 *
 * console.log(`Extents: X ${result.extents.min[X]} to ${result.extents.max[X]}`);
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
    const progressCallback =
      options.onProgress || ((_progress: ParseProgress) => {});
    const progressUpdates = options.progressUpdates ?? 40;

    addon.parseGCode(
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
