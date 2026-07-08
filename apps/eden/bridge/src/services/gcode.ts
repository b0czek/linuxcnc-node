/**
 * G-Code Service
 *
 * Exposes G-code parsing via AppBus using LinuxCNC's rs274ngc interpreter.
 * Implements GCodeProtocol from @linuxcnc-node/eden-protocol.
 */

import { parseGCode } from "@linuxcnc-node/gcode";
import type { GCodeProtocol } from "@linuxcnc-node/eden-protocol";
import type { HostConnection } from "@edenapp/types";

const SERVICE_NAME = "gcode";

/**
 * Initialize the G-code service
 */
export function initGCodeService(): void {
  worker!.appBus.exposeService(
    SERVICE_NAME,
    (connection, { appId: clientAppId }) => {
      console.log(`[GCode] Client connected: ${clientAppId}`);

      const typedConn = connection as HostConnection<GCodeProtocol>;

      // Handle disconnect
      connection.onClose(() => {
        console.log(`[GCode] Client disconnected: ${clientAppId}`);
      });

      // Parse handler
      typedConn.handle(
        "parse",
        async ({ filepath, iniPath, progressUpdates }) => {
          try {
            const result = await parseGCode(filepath, {
              iniPath,
              progressUpdates: progressUpdates ?? 40,
              onProgress: (progress) => {
                // Stream progress updates to the client
                try {
                  typedConn.send("parse-progress", progress);
                } catch (err) {
                  // Client may have disconnected
                  console.error("[GCode] Error sending progress:", err);
                }
              },
            });

            return result;
          } catch (err) {
            // Send error message
            typedConn.send("error", {
              code: "PARSE_ERROR",
              message: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
        }
      );

      // Ping handler
      typedConn.handle("ping", () => {
        return { timestamp: Date.now() };
      });
    },
    { description: "G-code file parsing using LinuxCNC interpreter" }
  );

  console.log(`[GCode] Service exposed as '${SERVICE_NAME}'`);
}
