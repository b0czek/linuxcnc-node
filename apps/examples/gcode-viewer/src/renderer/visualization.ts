import * as THREE from "three";
import { state } from "./state";
import { GCodeParseResult, OperationType } from "@linuxcnc-node/types";
import { computeArcPoints } from "./arc-utils";

// Position indices: X=0, Y=1, Z=2 (matches PositionIndex from gcode package)
const X = 0, Y = 1, Z = 2;

/**
 * Visualize the G-code path in the 3D scene
 */
export function visualizeGCode(result: GCodeParseResult): void {
  if (!state.scene || !state.controls || !state.camera) return;

  // Clear old path
  const prevPath = state.scene.getObjectByName("gcodePath");
  if (prevPath) state.scene.remove(prevPath);

  const points: THREE.Vector3[] = [];
  let currentPos = new THREE.Vector3(0, 0, 0);

  points.push(currentPos.clone());

  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });

  for (const op of result.operations) {
    if (op.type === OperationType.TRAVERSE || op.type === OperationType.FEED) {
      const nextPos = new THREE.Vector3(op.pos[X], op.pos[Y], op.pos[Z]);
      points.push(nextPos);
      currentPos = nextPos.clone();
    } else if (op.type === OperationType.ARC) {
      const nextPos = new THREE.Vector3(op.pos[X], op.pos[Y], op.pos[Z]);
      const arcPoints = computeArcPoints(
        currentPos,
        nextPos,
        op.arcData,
        op.plane
      );
      // Skip first point as it's the current position
      for (let i = 1; i < arcPoints.length; i++) {
        points.push(arcPoints[i]);
      }
      currentPos = nextPos.clone();
    }
  }

  geometry.setFromPoints(points);
  const line = new THREE.Line(geometry, material);
  line.name = "gcodePath";
  state.scene.add(line);

  // Set camera to view model, but always orbit around origin
  const box = new THREE.Box3().setFromObject(line);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = Math.max(100, maxDim * 1.5);
  state.controls.target.set(0, 0, 0); // Always orbit around origin
  state.camera.position.set(distance * 0.7, -distance * 0.7, distance * 0.7);
  state.controls.update();
}

/**
 * Build path segments from operations for progress tracking
 */
export function buildPathSegments(): void {
  state.pathSegments = [];
  state.totalPathLength = 0;
  let currentPos = new THREE.Vector3(0, 0, 0);

  for (let i = 0; i < state.operations.length; i++) {
    const op = state.operations[i];

    if (op.type === OperationType.TRAVERSE || op.type === OperationType.FEED) {
      const nextPos = new THREE.Vector3(op.pos[X], op.pos[Y], op.pos[Z]);
      const length = currentPos.distanceTo(nextPos);
      state.totalPathLength += length;
      state.pathSegments.push({
        opIndex: i,
        lineNumber: op.lineNumber,
        startPos: currentPos.clone(),
        endPos: nextPos.clone(),
        length,
        cumulativeLength: state.totalPathLength,
      });
      currentPos = nextPos.clone();
    } else if (
      op.type === OperationType.ARC &&
      "arcData" in op &&
      "plane" in op
    ) {
      const nextPos = new THREE.Vector3(op.pos[X], op.pos[Y], op.pos[Z]);
      const arcPoints = computeArcPoints(
        currentPos,
        nextPos,
        op.arcData as {
          centerFirst: number;
          centerSecond: number;
          rotation: number;
          axisEndPoint: number;
        },
        op.plane as number
      );
      // Calculate arc length
      let arcLen = 0;
      for (let j = 1; j < arcPoints.length; j++) {
        arcLen += arcPoints[j - 1].distanceTo(arcPoints[j]);
      }
      state.totalPathLength += arcLen;
      state.pathSegments.push({
        opIndex: i,
        lineNumber: op.lineNumber,
        startPos: currentPos.clone(),
        endPos: nextPos.clone(),
        length: arcLen,
        cumulativeLength: state.totalPathLength,
        arcPoints,
      });
      currentPos = nextPos.clone();
    }
  }
}
