/**
 * LinuxCNC Node Eden Bridge Backend
 *
 * Main entry point for the LinuxCNC-Eden bridge.
 * Initializes and exposes all AppBus services.
 */

import { initLinuxCNCService } from "./services/linuxcnc";
import { initGCodeService } from "./services/gcode";
import { initHalService } from "./services/hal";
import { initPositionLoggerService } from "./services/position-logger";

const appId = process.env.EDEN_APP_ID;
console.log(`[LinuxCNC Node Eden Bridge] Starting for ${appId}`);

// Initialize all services
initLinuxCNCService();
initGCodeService();
initHalService();
initPositionLoggerService();

console.log("[LinuxCNC Node Eden Bridge] All services initialized");
