import { CommandChannel, StatChannel, TaskState, TaskMode } from "../../src/ts";
import { spawn, ChildProcess, execSync } from "child_process";
import * as path from "path";

let linuxcncProcess: ChildProcess | null = null;

async function waitForBlankDisplay(timeout: number = 10000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      execSync("pgrep -f blank-display", { stdio: "ignore" });
      return;
    } catch (e) {
      await delay(100);
    }
  }
  throw new Error(
    "Timeout waiting for LinuxCNC to start (blank-display not found)"
  );
}

export async function startLinuxCNC(): Promise<void> {
  if (linuxcncProcess) {
    return;
  }

  const simDir = path.join(__dirname, "../linuxcnc-sim");
  const iniFile = path.join(simDir, "sim.ini");

  linuxcncProcess = spawn("linuxcnc", [iniFile], {
    cwd: simDir,
    detached: false,
    stdio: "inherit",
  });

  linuxcncProcess.on("error", (err) => {
    throw new Error(`Failed to start LinuxCNC: ${err.message}`);
  });

  await waitForBlankDisplay();
  await delay(1000);
  console.log("LinuxCNC started");
}

export async function stopLinuxCNC(): Promise<void> {
  if (linuxcncProcess) {
    linuxcncProcess.kill("SIGTERM");
    linuxcncProcess = null;
  }

  await delay(500);

  const { execSync } = require("child_process");
  try {
    execSync("pkill -f 'linuxcnc.*sim.ini' 2>/dev/null || true", {
      stdio: "ignore",
    });
    execSync("pkill -f 'blank-display' 2>/dev/null || true", {
      stdio: "ignore",
    });
    execSync("pkill -f 'milltask' 2>/dev/null || true", { stdio: "ignore" });
  } catch (e) {
    // Ignore errors
  }

  await delay(1000);
}

export async function setupLinuxCNC(
  commandChannel: CommandChannel,
  statChannel: StatChannel
): Promise<void> {
  await commandChannel.setState(TaskState.ESTOP_RESET);
  await delay(100);
  await waitForState(statChannel, TaskState.ESTOP_RESET, 2000);

  await commandChannel.setState(TaskState.ON);
  await delay(100);
  await waitForState(statChannel, TaskState.ON, 2000);

  await commandChannel.setTaskMode(TaskMode.MANUAL);
  await delay(100);
  await waitForMode(statChannel, TaskMode.MANUAL, 2000);

  await commandChannel.homeJoint(-1);
  await delay(2000);
  await waitForHomed(statChannel, 3000);
}

async function waitForState(
  statChannel: StatChannel,
  targetState: TaskState,
  timeout: number
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const status = statChannel.get();
    if (status?.task.state === targetState) {
      return;
    }
    await delay(50);
  }
  throw new Error(`Timeout waiting for state ${TaskState[targetState]}`);
}

async function waitForMode(
  statChannel: StatChannel,
  targetMode: TaskMode,
  timeout: number
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const status = statChannel.get();
    if (status?.task.mode === targetMode) {
      return;
    }
    await delay(50);
  }
  throw new Error(`Timeout waiting for mode ${TaskMode[targetMode]}`);
}

async function waitForHomed(
  statChannel: StatChannel,
  timeout: number
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const status = statChannel.get();
    if (!status) {
      await delay(50);
      continue;
    }

    const numJoints = status.motion.traj.joints;
    const configuredJoints = status.motion.joint.slice(0, numJoints);
    const allHomed = configuredJoints.every((joint) => joint.homed);

    if (allHomed) {
      console.log("All joints homed!");
      return;
    }
    await delay(50);
  }
  throw new Error("Timeout waiting for joints to be homed");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
