import * as THREE from "three";

export interface ArcData {
  centerFirst: number;
  centerSecond: number;
  rotation: number;
  axisEndPoint: number;
}

/**
 * Compute arc points given start position, end position, and arc data.
 * Returns an array of THREE.Vector3 points along the arc.
 */
export function computeArcPoints(
  startPos: THREE.Vector3,
  endPos: THREE.Vector3,
  arcData: ArcData,
  plane: number,
  segments: number = 32
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];

  // Determine which axes to use based on plane
  // Plane: XY=1, YZ=2, XZ=3
  let firstAxis: "x" | "y" | "z";
  let secondAxis: "x" | "y" | "z";
  let helixAxis: "x" | "y" | "z";

  switch (plane) {
    case 1: // XY plane
      firstAxis = "x";
      secondAxis = "y";
      helixAxis = "z";
      break;
    case 2: // YZ plane
      firstAxis = "y";
      secondAxis = "z";
      helixAxis = "x";
      break;
    case 3: // XZ plane
      firstAxis = "x";
      secondAxis = "z";
      helixAxis = "y";
      break;
    default:
      firstAxis = "x";
      secondAxis = "y";
      helixAxis = "z";
  }

  // Center of the arc
  const centerFirst = arcData.centerFirst;
  const centerSecond = arcData.centerSecond;

  // Calculate start angle
  const startFirst = startPos[firstAxis] - centerFirst;
  const startSecond = startPos[secondAxis] - centerSecond;
  const startAngle = Math.atan2(startSecond, startFirst);

  // Calculate end angle
  const endFirst = endPos[firstAxis] - centerFirst;
  const endSecond = endPos[secondAxis] - centerSecond;
  const endAngle = Math.atan2(endSecond, endFirst);

  // Radius (use start point to calculate)
  const radius = Math.sqrt(startFirst * startFirst + startSecond * startSecond);

  // Rotation: positive = CCW (G3), negative = CW (G2)
  const rotation = arcData.rotation;
  const isCW = rotation < 0;
  const numTurns = Math.abs(rotation);

  // Calculate sweep angle
  let sweepAngle: number;
  if (numTurns >= 1) {
    // Full circle(s) plus partial
    const partialSweep = isCW ? startAngle - endAngle : endAngle - startAngle;
    const normalizedPartial =
      partialSweep < 0 ? partialSweep + 2 * Math.PI : partialSweep;
    sweepAngle = (numTurns - 1) * 2 * Math.PI + normalizedPartial;
  } else {
    // Partial arc
    sweepAngle = isCW ? startAngle - endAngle : endAngle - startAngle;
    if (sweepAngle < 0) sweepAngle += 2 * Math.PI;
    if (sweepAngle === 0) sweepAngle = 2 * Math.PI; // Full circle
  }

  // Helix: interpolate along helix axis
  const helixStart = startPos[helixAxis];
  const helixEnd = arcData.axisEndPoint;
  const helixDelta = helixEnd - helixStart;

  // Generate points
  const totalSegments = Math.max(segments, Math.ceil(sweepAngle * 10));
  for (let i = 0; i <= totalSegments; i++) {
    const t = i / totalSegments;
    const angle = isCW
      ? startAngle - sweepAngle * t
      : startAngle + sweepAngle * t;

    const first = centerFirst + radius * Math.cos(angle);
    const second = centerSecond + radius * Math.sin(angle);
    const helix = helixStart + helixDelta * t;

    const point = new THREE.Vector3();
    point[firstAxis] = first;
    point[secondAxis] = second;
    point[helixAxis] = helix;
    points.push(point);
  }

  return points;
}

/**
 * Calculate total length of arc points
 */
export function calculateArcLength(arcPoints: THREE.Vector3[]): number {
  let length = 0;
  for (let i = 1; i < arcPoints.length; i++) {
    length += arcPoints[i - 1].distanceTo(arcPoints[i]);
  }
  return length;
}
