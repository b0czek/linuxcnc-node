import "./electron-api"; // Register global ElectronAPI types
import { state } from "./state";
import { initScene, onWindowResize, animate } from "./scene";
import { displayGCode } from "./gcode-panel";
import { visualizeGCode, buildPathSegments } from "./visualization";
import { resetPlayback, seekToProgress, animatePlayback } from "./playback";

/**
 * Update INI file path display
 */
function updateIniDisplay(iniPath: string): void {
  const el = document.getElementById("ini-path");
  if (el) {
    const filename = iniPath.split("/").pop() || iniPath;
    el.innerText = filename;
    el.title = iniPath;
  }
}

/**
 * Update speed display
 */
function updateSpeedDisplay(): void {
  const el = document.getElementById("speed-val");
  if (el) el.innerText = `${state.speed.toFixed(1)}x`;
}

/**
 * Handle opening a G-code file
 */
async function handleOpenFile(): Promise<void> {
  const result = await window.electronAPI.openFile();
  if (result.success && result.result) {
    console.log("Parsed result:", result.result);
    document.getElementById(
      "status"
    )!.innerText = `Loaded: ${result.result.operations.length} operations`;
    state.operations = result.result.operations;
    visualizeGCode(result.result);

    // Build path segments for progress tracking
    buildPathSegments();

    // Display G-code content
    if (result.gcodeContent) {
      displayGCode(result.gcodeContent, result.filePath);
    }

    // Show controls, progress bar, and gcode panel
    document.getElementById("controls")!.style.display = "block";
    document.getElementById("progress-bar")!.style.display = "block";
    document.getElementById("gcode-panel")!.style.display = "block";
    resetPlayback();
  } else {
    console.error("Failed to open:", result.error);
    document.getElementById("status")!.innerText = `Error: ${result.error}`;
  }
}

/**
 * Initialize the application
 */
function init(): void {
  const container = document.getElementById("app");
  if (!container) return;

  // Initialize Three.js scene
  initScene(container);

  // Event Listeners
  window.addEventListener("resize", onWindowResize);

  document
    .getElementById("open-btn")
    ?.addEventListener("click", handleOpenFile);

  document.getElementById("play-btn")?.addEventListener("click", () => {
    state.isPlaying = true;
    animatePlayback();
  });

  document.getElementById("pause-btn")?.addEventListener("click", () => {
    state.isPlaying = false;
  });

  document
    .getElementById("reset-btn")
    ?.addEventListener("click", resetPlayback);

  // Speed slider
  const speedSlider = document.getElementById(
    "speed-slider"
  ) as HTMLInputElement;
  speedSlider?.addEventListener("input", () => {
    state.speed = parseFloat(speedSlider.value);
    updateSpeedDisplay();
  });

  // Progress bar event listeners
  const progressSlider = document.getElementById(
    "playback-progress"
  ) as HTMLInputElement;
  progressSlider?.addEventListener("mousedown", () => {
    state.isDraggingProgress = true;
  });
  progressSlider?.addEventListener("mouseup", () => {
    state.isDraggingProgress = false;
  });
  progressSlider?.addEventListener("input", () => {
    seekToProgress(parseFloat(progressSlider.value) / 1000);
  });

  // INI file display - click to change
  document
    .getElementById("ini-display")
    ?.addEventListener("click", async () => {
      const result = await window.electronAPI.selectIni();
      if (result.success && result.iniPath) {
        updateIniDisplay(result.iniPath);
      }
    });

  // Listen for INI changes from main process
  window.electronAPI.onIniChanged((iniPath) => {
    updateIniDisplay(iniPath);
  });

  // Load initial INI path
  window.electronAPI.getIniPath().then((iniPath) => {
    if (iniPath) {
      updateIniDisplay(iniPath);
    }
  });

  // Start animation loop
  animate();
}

// Start the application
init();
