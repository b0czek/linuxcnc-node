import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { createLinuxCncClients } from "../dist/client.js";

const generated = join(import.meta.dirname, "../dist/generated");
assert.ok(existsSync(join(generated, "linuxcnc/v1/MachineService.d.ts")));
assert.ok(existsSync(join(generated, "linuxcnc/v1/ProgramService.d.ts")));
assert.ok(existsSync(join(generated, "linuxcnc/v1/HalService.d.ts")));
assert.ok(existsSync(join(generated, "linuxcnc/v1/ScopeService.d.ts")));
assert.ok(existsSync(join(generated, "grpc/health/v1/Health.d.ts")));
const command = readFileSync(join(generated, "linuxcnc/v1/ExecuteCommandRequest.d.ts"), "utf8");
assert.match(command, /'command'\?: "setTaskMode"/);
assert.match(command, /'setRapidRate'/);
const scalarDeclaration = readFileSync(join(generated, "linuxcnc/v1/HalScalar.d.ts"), "utf8");
assert.match(scalarDeclaration, /'s64'\?: \(number \| string/);
assert.match(scalarDeclaration, /'u64'\?: \(number \| string/);
const history = readFileSync(join(generated, "linuxcnc/v1/PositionHistoryBatch.d.ts"), "utf8");
assert.match(history, /'valuesLeF64'\?: \(Buffer/);
const packedDeclaration = readFileSync(join(generated, "linuxcnc/v1/PackedChannel.d.ts"), "utf8");
assert.match(packedDeclaration, /'index'\?: \(number\)/);
assert.match(packedDeclaration, /'enabled'\?: \(boolean\)/);
assert.equal(typeof createLinuxCncClients, "function");
const clients = await createLinuxCncClients({ address: "127.0.0.1:50051" });
for (const client of Object.values(clients)) client.close();
assert.ok(clients.health);

// A custom filename proves health schema resolution is explicit rather than
// inferred by rewriting protoPath.
const customRoot = mkdtempSync(join(tmpdir(), "linuxcnc-grpc-schema-"));
try {
  mkdirSync(join(customRoot, "linuxcnc/v1"), { recursive: true });
  mkdirSync(join(customRoot, "google/protobuf"), { recursive: true });
  mkdirSync(join(customRoot, "grpc/health/v1"), { recursive: true });
  copyFileSync(join(import.meta.dirname, "../proto/linuxcnc/v1/linuxcnc.proto"), join(customRoot, "linuxcnc/v1/custom-machine.proto"));
  copyFileSync(join(import.meta.dirname, "../proto/google/protobuf/empty.proto"), join(customRoot, "google/protobuf/empty.proto"));
  copyFileSync(join(import.meta.dirname, "../proto/grpc/health/v1/health.proto"), join(customRoot, "grpc/health/v1/custom-health.proto"));
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
const packageDefinition = protoLoader.loadSync([
  join(schemaRoot, "linuxcnc/v1/linuxcnc.proto"),
  join(schemaRoot, "grpc/health/v1/health.proto"),
], { keepCase: false, longs: String, enums: Number, bytes: Buffer, oneofs: true });
const loaded = grpc.loadPackageDefinition(packageDefinition);
const scalar = loaded.linuxcnc.v1.HalScalar;
const statDelta = loaded.linuxcnc.v1.LinuxCNCStatDelta;
// A source observation is atomic: several independently present fields,
// including valid zero values, must coexist in one sparse delta.
const atomicDeltaGolden = Buffer.from("0807100018014000", "hex");
assert.equal(statDelta.serialize({
  sequence: "7",
  echoSerialNumber: "0",
  state: 1,
  debug: 0,
}).toString("hex"), atomicDeltaGolden.toString("hex"));
const atomicDelta = statDelta.deserialize(atomicDeltaGolden);
assert.equal(atomicDelta.sequence, "7");
assert.equal(atomicDelta.echoSerialNumber, "0");
assert.equal(atomicDelta.state, 1);
assert.equal(atomicDelta.debug, 0);
// These bytes are checked in as protocol fixtures.  They cover the two
// lossless 64-bit HAL boundaries and make accidental number coercion visible.
const signedMinGolden = Buffer.from("080530ffffffffffffffffff01", "hex");
const unsignedMaxGolden = Buffer.from("080638ffffffffffffffffff01", "hex");
assert.equal(scalar.serialize({ type: 5, s64: "-9223372036854775808", value: "s64" }).toString("hex"), signedMinGolden.toString("hex"));
assert.equal(scalar.serialize({ type: 6, u64: "18446744073709551615", value: "u64" }).toString("hex"), unsignedMaxGolden.toString("hex"));
const signedDecoded = scalar.deserialize(signedMinGolden);
assert.equal(signedDecoded.s64, "-9223372036854775808");
assert.equal(signedDecoded.value, "s64");
const unsignedDecoded = scalar.deserialize(unsignedMaxGolden);
assert.equal(unsignedDecoded.u64, "18446744073709551615");
assert.equal(unsignedDecoded.value, "u64");

// A newer sender may append fields that this client does not know yet.  The
// known value must survive decoding, while reserialization intentionally
// drops the unknown field (proto-loader does not expose unknown fields).
const signedWithUnknownField = scalar.deserialize(Buffer.concat([signedMinGolden, Buffer.from("a00601", "hex")]));
assert.equal(signedWithUnknownField.s64, "-9223372036854775808");
assert.equal(scalar.serialize(signedWithUnknownField).toString("hex"), signedMinGolden.toString("hex"));

const packedChannel = loaded.linuxcnc.v1.PackedChannel;
const packedGolden = Buffer.from("0a10000000000000f43f00000000000004c010071801", "hex");
assert.equal(packedChannel.serialize({ values: [1.25, -2.5], index: 7, enabled: true }).toString("hex"), packedGolden.toString("hex"));
const packed = packedChannel.deserialize(packedGolden);
assert.deepEqual(packed.values, [1.25, -2.5]);
assert.equal(packed.index, 7);
assert.equal(packed.enabled, true);

// Position history is the explicit Float64Array boundary: bytes are always
// little-endian, independent of the host's native typed-array byte order.
const encodeLeF64 = (values) => {
  const bytes = Buffer.alloc(values.length * Float64Array.BYTES_PER_ELEMENT);
  values.forEach((value, index) => bytes.writeDoubleLE(value, index * Float64Array.BYTES_PER_ELEMENT));
  return bytes;
};
const decodeLeF64 = (bytes) => {
  assert.equal(bytes.length % Float64Array.BYTES_PER_ELEMENT, 0);
  const values = new Float64Array(bytes.length / Float64Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < values.length; index += 1) values[index] = bytes.readDoubleLE(index * Float64Array.BYTES_PER_ELEMENT);
  return values;
};
const historyMessage = loaded.linuxcnc.v1.PositionHistorySnapshot;
const historyGolden = Buffer.from("080c100f1a10000000000000f43f00000000000004c02002280a3003", "hex");
const historyValues = new Float64Array([1.25, -2.5]);
assert.equal(encodeLeF64(historyValues).toString("hex"), "000000000000f43f00000000000004c0");
assert.equal(historyMessage.serialize({
  firstSequence: "12",
  nextSequence: "15",
  valuesLeF64: encodeLeF64(historyValues),
  valueCount: historyValues.length,
  stride: 10,
  generation: "3",
}).toString("hex"), historyGolden.toString("hex"));
const historyDecoded = historyMessage.deserialize(Buffer.concat([historyGolden, Buffer.from("a00601", "hex")]));
assert.deepEqual(Array.from(decodeLeF64(historyDecoded.valuesLeF64)), Array.from(historyValues));
assert.equal(historyDecoded.valueCount, 2);
assert.equal(historyDecoded.stride, 10);
assert.equal(historyMessage.serialize(historyDecoded).toString("hex"), historyGolden.toString("hex"));
console.log("generated grpc service, command/oneof, reserved-field, 64-bit, unknown-field, packed-position, and binary golden conformance passed");
