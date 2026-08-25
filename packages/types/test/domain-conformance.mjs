import assert from "node:assert/strict";
import {
  ExecState,
  InterpState,
  JointType,
  POSITION_STRIDE,
  PositionLoggerIndex,
  PROTO_DOMAIN_FIELDS,
  PROTO_GCODE_OPERATION_VARIANTS,
  PROTO_HAL_SCALAR_VARIANTS,
  PROTO_PACKED_CHANNEL_FIELDS,
  PROTO_POSITION_LAYOUT,
  RcsStatus,
  TaskMode,
  TaskState,
  TrajMode,
} from "../dist/index.js";

assert.equal(TaskMode.MANUAL, 1);
assert.equal(TaskMode.AUTO, 2);
assert.equal(TaskMode.MDI, 3);
assert.equal(TaskState.ESTOP, 1);
assert.equal(TaskState.ON, 4);
assert.equal(RcsStatus.UNINITIALIZED, -1);
assert.equal(RcsStatus.DONE, 1);
assert.equal(ExecState.WAITING_FOR_MOTION_AND_IO, 7);
assert.equal(InterpState.WAITING, 4);
assert.equal(TrajMode.TELEOP, 3);
assert.equal(JointType.ANGULAR, 2);
assert.equal(POSITION_STRIDE, 10);
assert.equal(PositionLoggerIndex.MotionType, 9);
assert.deepEqual(Object.keys(PROTO_DOMAIN_FIELDS.LinuxCNCStat), [
  "echoSerialNumber",
  "state",
  "task",
  "motion",
  "io",
  "debug",
  "toolTable",
]);
assert.deepEqual(
  PROTO_GCODE_OPERATION_VARIANTS.map(({ wireName }) => wireName),
  [
    "arc",
    "probe",
    "rigid_tap",
    "dwell",
    "nurbs_g5",
    "nurbs_g6",
    "units_change",
    "plane_change",
    "g5x_offset",
    "g92_offset",
    "xy_rotation",
    "tool_offset",
    "tool_change",
    "feed_rate_change",
  ],
);
assert.deepEqual(
  PROTO_HAL_SCALAR_VARIANTS.map(({ wireName }) => wireName),
  ["bit", "float_value", "s32", "u32", "s64", "u64"],
);
assert.deepEqual(
  PROTO_PACKED_CHANNEL_FIELDS.map(({ wireName, number }) => [wireName, number]),
  [
    ["values", 1],
    ["index", 2],
    ["enabled", 3],
  ],
);
assert.deepEqual(PROTO_POSITION_LAYOUT, {
  Position: { storage: "Float64Array", length: 9 },
  Position3: { storage: "Float64Array", length: 3 },
  PositionHistory: { storage: "Float64Array", stride: 10 },
});

// Keep a small, entirely synthetic status fixture here as a reconstruction
// oracle for typed sparse updates.  It deliberately exercises nested objects
// and indexed arrays without importing a transport/client or any external
// consumer's fixture data.
const cloneDomainValue = (value) => {
  if (value instanceof Float64Array) return new Float64Array(value);
  if (Array.isArray(value)) return value.map(cloneDomainValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneDomainValue(item)]),
    );
  }
  return value;
};
const applySparseStatusDelta = (status, delta) => {
  const next = cloneDomainValue(status);
  if (delta.echoSerialNumber !== undefined)
    next.echoSerialNumber = delta.echoSerialNumber;
  if (delta.state !== undefined) next.state = delta.state;
  if (delta.debug !== undefined) next.debug = delta.debug;
  if (delta.task) next.task = { ...next.task, ...delta.task };
  if (delta.io) next.io = { ...next.io, ...delta.io };
  if (delta.motion) {
    const { joint, axis, spindle, traj, ...motionFields } = delta.motion;
    next.motion = { ...next.motion, ...motionFields };
    if (traj) next.motion.traj = { ...next.motion.traj, ...traj };
    for (const [key, entries] of [
      ["joint", joint],
      ["axis", axis],
      ["spindle", spindle],
    ]) {
      if (!entries) continue;
      for (const { index, value } of entries) {
        next.motion[key][index] = { ...next.motion[key][index], ...value };
      }
    }
  }
  return next;
};
const sparseBase = {
  echoSerialNumber: 10,
  state: RcsStatus.DONE,
  task: { mode: TaskMode.AUTO, currentLine: 100, file: "synthetic.ngc" },
  motion: {
    traj: { position: new Float64Array([1, 2, 3]) },
    joint: [
      { input: 1, velocity: 2 },
      { input: 3, velocity: 4 },
    ],
    axis: [{ velocity: 5 }],
    spindle: [{ speed: 6 }],
    digitalInput: [1, 0],
  },
  io: { estop: false, coolant: { mist: false, flood: true } },
  debug: 0,
};
const sparseDelta = {
  sequence: 11,
  task: { currentLine: 120 },
  motion: {
    joint: [{ index: 1, value: { velocity: 9 } }],
    traj: { position: new Float64Array([7, 8, 9]) },
  },
  io: { estop: true },
};
const reconstructed = applySparseStatusDelta(sparseBase, sparseDelta);
assert.equal(reconstructed.task.currentLine, 120);
assert.equal(reconstructed.task.mode, TaskMode.AUTO);
assert.equal(reconstructed.motion.joint[1].velocity, 9);
assert.equal(reconstructed.motion.joint[1].input, 3);
assert.equal(reconstructed.motion.joint[0].velocity, 2);
assert.deepEqual(Array.from(reconstructed.motion.traj.position), [7, 8, 9]);
assert.deepEqual(reconstructed.motion.digitalInput, [1, 0]);
assert.equal(reconstructed.io.estop, true);
assert.equal(reconstructed.io.coolant.flood, true);
assert.equal(sparseBase.task.currentLine, 100);
assert.equal(sparseBase.motion.joint[1].velocity, 4);
assert.deepEqual(Array.from(sparseBase.motion.traj.position), [1, 2, 3]);
console.log("domain enum, structural, and position layout conformance passed");
