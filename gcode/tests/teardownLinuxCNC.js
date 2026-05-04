const { execSync } = require("child_process");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async () => {
  if (global.__LINUXCNC_GCODE_PROCESS__) {
    global.__LINUXCNC_GCODE_PROCESS__.kill("SIGTERM");
    global.__LINUXCNC_GCODE_PROCESS__ = null;
  }

  await delay(500);

  try {
    execSync("pkill -f 'linuxcnc.*gcode/tests/config.ini' 2>/dev/null || true", {
      stdio: "ignore",
    });
    execSync("pkill -f 'gcode/tests/blank-display' 2>/dev/null || true", {
      stdio: "ignore",
    });
    execSync("pkill -f 'milltask' 2>/dev/null || true", { stdio: "ignore" });
  } catch {
    // Best-effort cleanup only.
  }

  await delay(1000);
};
