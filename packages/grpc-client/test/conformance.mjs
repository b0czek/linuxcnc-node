import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { createLinuxCncClients } from "../dist/client.js";
import { executeCommand } from "../dist/command.js";

const generated = join(import.meta.dirname, "../dist/generated");
assert.ok(existsSync(join(generated, "linuxcnc/v1/MachineService.d.ts")));
assert.ok(existsSync(join(generated, "linuxcnc/v1/ProgramService.d.ts")));
assert.ok(existsSync(join(generated, "linuxcnc/v1/HalService.d.ts")));
assert.ok(existsSync(join(generated, "linuxcnc/v1/ScopeService.d.ts")));
assert.ok(existsSync(join(generated, "grpc/health/v1/Health.d.ts")));
const command = readFileSync(
  join(generated, "linuxcnc/v1/ExecuteCommandRequest.d.ts"),
  "utf8",
);
assert.match(command, /'command'\?: "setTaskMode"/);
assert.match(command, /'setRapidRate'/);
const scalarDeclaration = readFileSync(
  join(generated, "linuxcnc/v1/HalScalar.d.ts"),
  "utf8",
);
assert.match(scalarDeclaration, /'s64'\?: \(number \| string/);
assert.match(scalarDeclaration, /'u64'\?: \(number \| string/);
const packedDeclaration = readFileSync(
  join(generated, "linuxcnc/v1/PackedChannel.d.ts"),
  "utf8",
);
assert.match(packedDeclaration, /'index'\?: \(number\)/);
assert.match(packedDeclaration, /'enabled'\?: \(boolean\)/);
assert.equal(typeof createLinuxCncClients, "function");
const clients = await createLinuxCncClients({ address: "127.0.0.1:50051" });
for (const client of Object.values(clients)) client.close();
assert.ok(clients.health);

const requests = [];
const machine = {
  executeCommand(request, callback) {
    requests.push(request);
    callback(null, { commandSequence: "7", status: 1 });
  },
};
assert.deepEqual(
  await executeCommand(
    machine,
    { type: "setSpindleOverride", scale: 1.2, spindleIndex: 0 },
    "accepted",
  ),
  { commandSequence: "7", status: 1 },
);
await executeCommand(
  machine,
  {
    type: "spindleOn",
    speed: 1200,
    spindleIndex: 1,
    waitForSpeed: false,
  },
  "completed",
);
await executeCommand(
  machine,
  { type: "spindleOn", speed: 1200, spindleIndex: 1 },
  "completed",
);
await executeCommand(
  machine,
  {
    type: "programOpen",
    entry: { workspaceId: "main", relativePath: "part.ngc" },
  },
  "completed",
);
await executeCommand(
  machine,
  {
    type: "setTool",
    tool: { toolNo: 7, diameter: 0, offset: { values: [0.25] } },
  },
  "completed",
);
assert.deepEqual(requests[0], {
  command: "setSpindleOverride",
  setSpindleOverride: { scale: 1.2, spindleIndex: 0 },
  waitPolicy: "WAIT_POLICY_ACCEPTED",
});
assert.equal(requests[1].spindleOn.waitForSpeed, false);
assert.equal("waitForSpeed" in requests[2].spindleOn, false);
assert.deepEqual(requests[3].programOpen.entry, {
  workspaceId: "main",
  relativePath: "part.ngc",
});
assert.deepEqual(requests[4].setTool.tool, {
  toolNo: 7,
  diameter: 0,
  offset: { values: [0.25] },
});

// A custom filename proves health schema resolution is explicit rather than
// inferred by rewriting protoPath.
const customRoot = mkdtempSync(join(tmpdir(), "linuxcnc-grpc-schema-"));
try {
  mkdirSync(join(customRoot, "linuxcnc/v1"), { recursive: true });
  mkdirSync(join(customRoot, "google/protobuf"), { recursive: true });
  mkdirSync(join(customRoot, "grpc/health/v1"), { recursive: true });
  for (const file of [
    "common.proto",
    "machine.proto",
    "program.proto",
    "hal.proto",
    "scope.proto",
    "websocket.proto",
  ]) {
    copyFileSync(
      join(import.meta.dirname, "../proto/linuxcnc/v1", file),
      join(customRoot, "linuxcnc/v1", file),
    );
  }
  copyFileSync(
    join(import.meta.dirname, "../proto/linuxcnc/v1/linuxcnc.proto"),
    join(customRoot, "linuxcnc/v1/custom-machine.proto"),
  );
  copyFileSync(
    join(import.meta.dirname, "../proto/google/protobuf/empty.proto"),
    join(customRoot, "google/protobuf/empty.proto"),
  );
  copyFileSync(
    join(import.meta.dirname, "../proto/grpc/health/v1/health.proto"),
    join(customRoot, "grpc/health/v1/custom-health.proto"),
  );
  const customClients = await createLinuxCncClients({
    address: "127.0.0.1:50051",
    protoRoot: customRoot,
    protoPath: join(customRoot, "linuxcnc/v1/custom-machine.proto"),
    healthProtoPath: join(customRoot, "grpc/health/v1/custom-health.proto"),
  });
  for (const client of Object.values(customClients)) client.close();
} finally {
  rmSync(customRoot, { recursive: true, force: true });
}

const schemaRoot = join(import.meta.dirname, "../proto");
const packageDefinition = protoLoader.loadSync(
  [
    join(schemaRoot, "linuxcnc/v1/linuxcnc.proto"),
    join(schemaRoot, "grpc/health/v1/health.proto"),
  ],
  {
    includeDirs: [schemaRoot],
    keepCase: false,
    longs: String,
    enums: Number,
    bytes: Buffer,
    oneofs: true,
    defaults: true,
  },
);
const loaded = grpc.loadPackageDefinition(packageDefinition);
const executeDefinition =
  loaded.linuxcnc.v1.MachineService.service.ExecuteCommand;
const encodedToolCommand = executeDefinition.requestSerialize(requests[4]);
const decodedToolCommand =
  executeDefinition.requestDeserialize(encodedToolCommand);
assert.deepEqual(decodedToolCommand.setTool.tool.offset.values, [0.25]);
assert.equal(decodedToolCommand.setTool.tool.diameter, 0);
assert.equal(decodedToolCommand.setTool.tool.pocketNo, undefined);
assert.equal(loaded.linuxcnc.v1.ProgramService.service.parseProgram, undefined);
assert.ok(loaded.linuxcnc.v1.PositionHistoryFrame);
assert.ok(loaded.linuxcnc.v1.HalValueFrame);
assert.ok(loaded.linuxcnc.v1.ProgramPreviewEvent);
const scalar = loaded.linuxcnc.v1.HalScalar;
const statDelta = loaded.linuxcnc.v1.LinuxCNCStatDelta;
const emptyDelta = statDelta.deserialize(Buffer.alloc(0));
assert.equal(emptyDelta.echoSerialNumber, undefined);
assert.equal(emptyDelta.debug, undefined);
const trajectory = loaded.linuxcnc.v1.TrajectoryStat.deserialize(
  Buffer.alloc(0),
);
assert.equal(trajectory.inPosition, false);
assert.equal(trajectory.queue, 0);
const indexedJoint = loaded.linuxcnc.v1.IndexedJointDelta.deserialize(
  Buffer.alloc(0),
);
assert.equal(indexedJoint.index, 0);
// A source observation is atomic: several independently present fields,
// including valid zero values, must coexist in one sparse delta.
const atomicDeltaGolden = Buffer.from("0807100018014000", "hex");
assert.equal(
  statDelta
    .serialize({
      sequence: "7",
      echoSerialNumber: "0",
      state: 1,
      debug: 0,
    })
    .toString("hex"),
  atomicDeltaGolden.toString("hex"),
);
const atomicDelta = statDelta.deserialize(atomicDeltaGolden);
assert.equal(atomicDelta.sequence, "7");
assert.equal(atomicDelta.echoSerialNumber, "0");
assert.equal(atomicDelta.state, 1);
assert.equal(atomicDelta.debug, 0);
// These bytes are checked in as protocol fixtures.  They cover the two
// lossless 64-bit HAL boundaries and make accidental number coercion visible.
const signedMinGolden = Buffer.from("080530ffffffffffffffffff01", "hex");
const unsignedMaxGolden = Buffer.from("080638ffffffffffffffffff01", "hex");
assert.equal(
  scalar
    .serialize({ type: 5, s64: "-9223372036854775808", value: "s64" })
    .toString("hex"),
  signedMinGolden.toString("hex"),
);
assert.equal(
  scalar
    .serialize({ type: 6, u64: "18446744073709551615", value: "u64" })
    .toString("hex"),
  unsignedMaxGolden.toString("hex"),
);
const signedDecoded = scalar.deserialize(signedMinGolden);
assert.equal(signedDecoded.s64, "-9223372036854775808");
assert.equal(signedDecoded.value, "s64");
const unsignedDecoded = scalar.deserialize(unsignedMaxGolden);
assert.equal(unsignedDecoded.u64, "18446744073709551615");
assert.equal(unsignedDecoded.value, "u64");

// A newer sender may append fields that this client does not know yet.  The
// known value must survive decoding, while reserialization intentionally
// drops the unknown field (proto-loader does not expose unknown fields).
const signedWithUnknownField = scalar.deserialize(
  Buffer.concat([signedMinGolden, Buffer.from("a00601", "hex")]),
);
assert.equal(signedWithUnknownField.s64, "-9223372036854775808");
assert.equal(
  scalar.serialize(signedWithUnknownField).toString("hex"),
  signedMinGolden.toString("hex"),
);

const packedChannel = loaded.linuxcnc.v1.PackedChannel;
const packedGolden = Buffer.from(
  "0a10000000000000f43f00000000000004c010071801",
  "hex",
);
assert.equal(
  packedChannel
    .serialize({ values: [1.25, -2.5], index: 7, enabled: true })
    .toString("hex"),
  packedGolden.toString("hex"),
);
const packed = packedChannel.deserialize(packedGolden);
assert.deepEqual(packed.values, [1.25, -2.5]);
assert.equal(packed.index, 7);
assert.equal(packed.enabled, true);

const spindleOn = loaded.linuxcnc.v1.SpindleOn;
const spindleDefault = spindleOn.deserialize(
  spindleOn.serialize({ speed: 1000 }),
);
const spindleNoWait = spindleOn.deserialize(
  spindleOn.serialize({ speed: 1000, waitForSpeed: false }),
);
assert.equal(spindleDefault.waitForSpeed, undefined);
assert.equal(spindleNoWait.waitForSpeed, false);
assert.equal(spindleNoWait._waitForSpeed, "waitForSpeed");

const toolEntry = loaded.linuxcnc.v1.ToolEntry;
const partialTool = toolEntry.deserialize(
  toolEntry.serialize({
    toolNo: 7,
    diameter: 0,
    wearOffset: { values: [0.25] },
  }),
);
assert.equal(partialTool.pocketNo, undefined);
assert.equal(partialTool.diameter, 0);
assert.equal(partialTool._diameter, "diameter");
assert.deepEqual(partialTool.wearOffset.values, [0.25]);

console.log(
  "generated grpc service, command/oneof, scalar presence, 64-bit, unknown-field, and packed-channel conformance passed",
);
