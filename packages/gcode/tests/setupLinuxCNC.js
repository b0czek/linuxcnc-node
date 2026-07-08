const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execSync } = require("child_process");

const simDir = __dirname;
const iniFile = path.join(simDir, "config.ini");
const toolDataHome = path.join(
  os.tmpdir(),
  `linuxcnc-node-gcode-${process.getuid?.() ?? "user"}`
);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStartup(processHandle, timeout = 10000) {
  const startedAt = Date.now();
  let exitCode = null;

  processHandle.once("exit", (code, signal) => {
    exitCode = signal || code;
  });

  while (Date.now() - startedAt < timeout) {
    if (exitCode !== null) {
      throw new Error(`LinuxCNC exited during startup: ${exitCode}`);
    }

    try {
      execSync("pgrep -f 'gcode/tests/blank-display'", { stdio: "ignore" });
      await delay(1000);
      return;
    } catch {
      await delay(100);
    }
  }

  throw new Error("Timeout waiting for LinuxCNC gcode test runtime to start");
}

module.exports = async () => {
  fs.mkdirSync(toolDataHome, { recursive: true });
  fs.rmSync(path.join(toolDataHome, ".tool.mmap"), { force: true });

  process.env.HOME = toolDataHome;

  const linuxcncProcess = spawn("linuxcnc", ["-r", iniFile], {
    cwd: simDir,
    detached: false,
    env: process.env,
    stdio: "inherit",
  });

  global.__LINUXCNC_GCODE_PROCESS__ = linuxcncProcess;

  linuxcncProcess.on("error", (error) => {
    throw new Error(`Failed to start LinuxCNC: ${error.message}`);
  });

  await waitForStartup(linuxcncProcess);
};
