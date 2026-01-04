import * as THREE from "three";
import { state } from "./state";
import { OperationType } from "@linuxcnc-node/gcode";
import { computeArcPoints, ArcData } from "./arc-utils";
import { highlightGcodeLine } from "./gcode-panel";

// Position indices: X=0, Y=1, Z=2 (matches PositionIndex from gcode package)
const X = 0, Y = 1, Z = 2;

/**
 * Reset playback to starting position
 */
export function resetPlayback(): void {
  state.currentOpIndex = 0;
  state.progressInOp = 0;
  state.currentFeedrate = 1000;
  state.currentArcPoints = [];
  state.arcTotalLength = 0;
  state.arcDistanceTraveled = 0;
  state.globalDistanceTraveled = 0;
  // Set tool to start
  if (state.toolMesh) {
    state.toolMesh.position.set(0, 0, 0);
  }
  state.isPlaying = false;
  // Reset G-code line highlight
  highlightGcodeLine(0);
  updateProgressDisplay();
}

/**
 * Update progress bar display
 */
export function updateProgressDisplay(): void {
  if (state.isDraggingProgress) return;

  const progress =
    state.totalPathLength > 0
      ? state.globalDistanceTraveled / state.totalPathLength
      : 0;
  const progressSlider = document.getElementById(
    "playback-progress"
  ) as HTMLInputElement;
  if (progressSlider) {
    progressSlider.value = String(Math.round(progress * 1000));
  }

  const currentEl = document.getElementById("progress-current");
  if (currentEl) currentEl.innerText = `${Math.round(progress * 100)}%`;

  const opEl = document.getElementById("progress-op");
  if (opEl)
    opEl.innerText = `Op: ${state.currentOpIndex} / ${state.operations.length}`;

  // Update G-code line highlight based on current operation
  if (state.currentOpIndex < state.operations.length) {
    const op = state.operations[state.currentOpIndex];
    if ("lineNumber" in op && typeof op.lineNumber === "number") {
      highlightGcodeLine(op.lineNumber);
    }
  }
}

/**
 * Seek to a specific progress (0-1)
 */
export function seekToProgress(progress: number): void {
  if (state.totalPathLength === 0 || !state.toolMesh) return;

  const targetDistance = progress * state.totalPathLength;
  state.globalDistanceTraveled = targetDistance;

  // Find the segment containing this distance
  let prevCumulative = 0;
  for (const seg of state.pathSegments) {
    if (targetDistance <= seg.cumulativeLength) {
      // We're in this segment
      const distIntoSegment = targetDistance - prevCumulative;
      const t = seg.length > 0 ? distIntoSegment / seg.length : 0;

      if (seg.arcPoints) {
        // Interpolate along arc
        let accum = 0;
        for (let i = 1; i < seg.arcPoints.length; i++) {
          const segDist = seg.arcPoints[i - 1].distanceTo(seg.arcPoints[i]);
          if (accum + segDist >= distIntoSegment) {
            const arcT = segDist > 0 ? (distIntoSegment - accum) / segDist : 0;
            state.toolMesh.position.lerpVectors(
              seg.arcPoints[i - 1],
              seg.arcPoints[i],
              arcT
            );
            break;
          }
          accum += segDist;
        }
        // Set up arc animation state
        state.currentArcPoints = seg.arcPoints;
        state.arcTotalLength = seg.length;
        state.arcDistanceTraveled = distIntoSegment;
      } else {
        // Linear interpolation
        state.toolMesh.position.lerpVectors(seg.startPos, seg.endPos, t);
        state.currentArcPoints = [];
        state.arcTotalLength = 0;
        state.arcDistanceTraveled = 0;
      }

      // Update operation index and highlight G-code line
      state.currentOpIndex = seg.opIndex;
      highlightGcodeLine(seg.lineNumber);
      updateProgressDisplay();
      return;
    }
    prevCumulative = seg.cumulativeLength;
  }

  // At the end
  if (state.pathSegments.length > 0) {
    const lastSeg = state.pathSegments[state.pathSegments.length - 1];
    state.toolMesh.position.copy(lastSeg.endPos);
    state.currentOpIndex = state.operations.length;
  }
  updateProgressDisplay();
}

/**
 * Main playback animation loop
 */
export function animatePlayback(): void {
  if (!state.isPlaying || !state.toolMesh) return;

  if (state.currentOpIndex >= state.operations.length) {
    state.isPlaying = false;
    return;
  }

  // Process operations until we find a motion command or run out
  let op = state.operations[state.currentOpIndex];

  while (state.currentOpIndex < state.operations.length) {
    op = state.operations[state.currentOpIndex];

    // Check for feedrate change
    if (op.type === OperationType.FEED_RATE_CHANGE) {
      state.currentFeedrate = op.feedRate;
      state.currentOpIndex++;
      continue;
    }

    // Check if it is a motion op
    if (
      op.type === OperationType.FEED ||
      op.type === OperationType.TRAVERSE ||
      op.type === OperationType.ARC ||
      op.type === OperationType.PROBE ||
      op.type === OperationType.RIGID_TAP ||
      op.type === OperationType.NURBS_G5 ||
      op.type === OperationType.NURBS_G6
    ) {
      break; // Found motion, stop and animate it
    }

    // Otherwise skip (other state changes or non-motion)
    state.currentOpIndex++;
  }

  if (state.currentOpIndex >= state.operations.length) {
    state.isPlaying = false;
    return;
  }

  // Now 'op' is a motion operation - check if it has pos property
  if (!("pos" in op) || !op.pos) {
    state.currentOpIndex++;
    requestAnimationFrame(animatePlayback);
    return;
  }

  // Determine speed for this segment
  let feedrate = state.currentFeedrate;
  if (op.type === OperationType.TRAVERSE) {
    feedrate = state.RAPID_FEEDRATE;
  }

  // Convert Units/Min to Units/Frame (assuming 60FPS)
  const moveSpeed = (feedrate / 3600) * state.speed;

  // Handle arc motions differently
  if (op.type === OperationType.ARC && "arcData" in op && "plane" in op) {
    // Initialize arc points if needed
    if (state.currentArcPoints.length === 0) {
      const startPos = state.toolMesh.position.clone();
      const endPos = new THREE.Vector3(op.pos[X], op.pos[Y], op.pos[Z]);
      state.currentArcPoints = computeArcPoints(
        startPos,
        endPos,
        op.arcData as ArcData,
        op.plane as number
      );
      // Calculate total arc length
      state.arcTotalLength = 0;
      for (let i = 1; i < state.currentArcPoints.length; i++) {
        state.arcTotalLength += state.currentArcPoints[i - 1].distanceTo(
          state.currentArcPoints[i]
        );
      }
      state.arcDistanceTraveled = 0;
    }

    // Move along arc by feedrate distance
    state.arcDistanceTraveled += moveSpeed;
    state.globalDistanceTraveled += moveSpeed;

    // Find position along arc based on distance traveled
    if (state.arcDistanceTraveled >= state.arcTotalLength) {
      // Arc complete - move to final position
      state.toolMesh.position.copy(
        state.currentArcPoints[state.currentArcPoints.length - 1]
      );
      state.currentArcPoints = [];
      state.arcTotalLength = 0;
      state.arcDistanceTraveled = 0;
      state.currentOpIndex++;
    } else {
      // Interpolate position along arc points
      let accumulatedDist = 0;
      for (let i = 1; i < state.currentArcPoints.length; i++) {
        const segmentDist = state.currentArcPoints[i - 1].distanceTo(
          state.currentArcPoints[i]
        );
        if (accumulatedDist + segmentDist >= state.arcDistanceTraveled) {
          // We're within this segment
          const t = (state.arcDistanceTraveled - accumulatedDist) / segmentDist;
          state.toolMesh.position.lerpVectors(
            state.currentArcPoints[i - 1],
            state.currentArcPoints[i],
            t
          );
          break;
        }
        accumulatedDist += segmentDist;
      }
    }
    updateProgressDisplay();
  } else if ("pos" in op && op.pos) {
    // Linear motion (TRAVERSE, FEED, etc.)
    const targetPos = new THREE.Vector3(op.pos[X], op.pos[Y], op.pos[Z]);
    const startPos = state.toolMesh.position.clone();
    const distance = startPos.distanceTo(targetPos);

    if (distance <= moveSpeed) {
      // Reached end of segment
      state.globalDistanceTraveled += distance;
      state.toolMesh.position.copy(targetPos);
      state.currentOpIndex++;
    } else {
      // Move fractional amount
      state.globalDistanceTraveled += moveSpeed;
      const dir = targetPos.clone().sub(startPos).normalize();
      state.toolMesh.position.add(dir.multiplyScalar(moveSpeed));
    }
    updateProgressDisplay();
  }

  requestAnimationFrame(animatePlayback);
}
