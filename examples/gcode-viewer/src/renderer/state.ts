import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GCodeOperation } from "@linuxcnc-node/gcode";

// Path segment for progress tracking
export interface PathSegment {
  opIndex: number;
  lineNumber: number;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  length: number;
  cumulativeLength: number;
  arcPoints?: THREE.Vector3[];
}

// Application state - centralized mutable state
export const state = {
  // Three.js objects
  scene: null as THREE.Scene | null,
  camera: null as THREE.PerspectiveCamera | null,
  renderer: null as THREE.WebGLRenderer | null,
  controls: null as OrbitControls | null,
  toolMesh: null as THREE.Mesh | null,

  // G-code data
  operations: [] as GCodeOperation[],

  // Playback state
  isPlaying: false,
  currentOpIndex: 0,
  progressInOp: 0,
  speed: 1.0,
  animationId: null as number | null,
  currentFeedrate: 1000,
  RAPID_FEEDRATE: 5000,

  // Arc animation state
  currentArcPoints: [] as THREE.Vector3[],
  arcTotalLength: 0,
  arcDistanceTraveled: 0,

  // Progress tracking
  pathSegments: [] as PathSegment[],
  totalPathLength: 0,
  globalDistanceTraveled: 0,
  isDraggingProgress: false,

  // G-code display state
  gcodeLines: [] as string[],
  currentGcodeLine: 0,
};
