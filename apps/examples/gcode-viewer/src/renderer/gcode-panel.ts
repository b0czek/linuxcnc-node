import { state } from "./state";
import { seekToProgress } from "./playback";

/**
 * Display G-code content in the panel
 */
export function displayGCode(content: string, filePath?: string): void {
  state.gcodeLines = content.split("\n");
  const container = document.getElementById("gcode-content")!;
  container.innerHTML = "";

  // Show filename
  const filenameEl = document.getElementById("gcode-filename");
  if (filenameEl && filePath) {
    const filename = filePath.split("/").pop() || "G-Code Program";
    filenameEl.innerText = filename;
  }

  // Create line elements
  state.gcodeLines.forEach((line, index) => {
    const lineEl = document.createElement("div");
    lineEl.className = "gcode-line";
    lineEl.id = `gcode-line-${index + 1}`;
    lineEl.style.cursor = "pointer";

    // Click to seek to this line
    lineEl.addEventListener("click", () => {
      seekToLine(index + 1);
    });

    const numEl = document.createElement("span");
    numEl.className = "gcode-line-num";
    numEl.innerText = String(index + 1);

    const textEl = document.createElement("span");
    textEl.className = "gcode-line-text";
    textEl.innerText = line;

    lineEl.appendChild(numEl);
    lineEl.appendChild(textEl);
    container.appendChild(lineEl);
  });
}

/**
 * Seek playback to a specific G-code line number
 */
export function seekToLine(lineNumber: number): void {
  // Find the first path segment with this line number
  for (const seg of state.pathSegments) {
    if (seg.lineNumber === lineNumber) {
      // Calculate progress based on the start of this segment
      const prevCumulative = seg.cumulativeLength - seg.length;
      const progress =
        state.totalPathLength > 0 ? prevCumulative / state.totalPathLength : 0;
      seekToProgress(progress);
      return;
    }
  }
  // If no exact match, find the closest segment with a line number >= target
  for (const seg of state.pathSegments) {
    if (seg.lineNumber >= lineNumber) {
      const prevCumulative = seg.cumulativeLength - seg.length;
      const progress =
        state.totalPathLength > 0 ? prevCumulative / state.totalPathLength : 0;
      seekToProgress(progress);
      return;
    }
  }
}

/**
 * Highlight the current G-code line
 */
export function highlightGcodeLine(lineNumber: number): void {
  if (lineNumber === state.currentGcodeLine) return;

  // Remove previous highlight
  if (state.currentGcodeLine > 0) {
    const prevLine = document.getElementById(
      `gcode-line-${state.currentGcodeLine}`
    );
    if (prevLine) prevLine.classList.remove("active");
  }

  // Add new highlight
  state.currentGcodeLine = lineNumber;
  const newLine = document.getElementById(`gcode-line-${lineNumber}`);
  if (newLine) {
    newLine.classList.add("active");
    // Scroll into view
    newLine.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Update indicator
  const indicator = document.getElementById("gcode-line-indicator");
  if (indicator) indicator.innerText = `Line: ${lineNumber}`;
}
