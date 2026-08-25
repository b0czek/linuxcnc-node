import assert from "node:assert/strict";
import test from "node:test";
import { HalType } from "@linuxcnc-node/grpc-client";
import { decodeHalTelemetryFrame } from "../../frontend/src/hal-telemetry";
import { domainHalValue, mapScopeCapture, wireHalValue } from "./grpc";

test("HAL 64-bit scalars cross the wire/domain boundary losslessly", () => {
  const signed = wireHalValue("s64", -(1n << 63n));
  const unsigned = wireHalValue("u64", (1n << 64n) - 1n);

  assert.equal(signed.type, HalType.HAL_TYPE_S64);
  assert.equal(unsigned.type, HalType.HAL_TYPE_U64);
  assert.equal(domainHalValue(signed), -(1n << 63n));
  assert.equal(domainHalValue(unsigned), (1n << 64n) - 1n);
});

test("HAL telemetry frames preserve typed slots and 64-bit values", () => {
  const buffer = new ArrayBuffer(64);
  const view = new DataView(buffer);
  [0x4c, 0x43, 0x48, 0x56].forEach((value, index) => {
    view.setUint8(index, value);
  });
  view.setUint8(4, 1);
  view.setUint8(5, 1);
  view.setUint16(6, 16, true);
  view.setBigUint64(8, 3n, true);
  view.setBigUint64(16, 7n, true);
  view.setUint32(24, 2, true);
  view.setUint32(32, 4, true);
  view.setUint8(36, 5);
  view.setBigInt64(40, -(1n << 63n), true);
  view.setUint32(48, 8, true);
  view.setUint8(52, 6);
  view.setBigUint64(56, (1n << 64n) - 1n, true);

  const frame = decodeHalTelemetryFrame(buffer);
  assert.equal(frame.kind, "replacement");
  assert.equal(frame.revision, 3);
  assert.equal(frame.sequence, 7n);
  assert.deepEqual(frame.entries, [
    { slot: 4, type: 5, value: -(1n << 63n) },
    { slot: 8, type: 6, value: (1n << 64n) - 1n },
  ]);
});

test("scope packed channels become the existing Float64Array domain layout", () => {
  const capture = mapScopeCapture({
    channels: [{ values: [1, 2, 3] }, null, { values: [4] }],
    samples: 3,
    triggerIndex: 1,
    samplePeriodNs: "1000",
  });

  assert.deepEqual(capture.channels[0], new Float64Array([1, 2, 3]));
  assert.equal(capture.channels[1], null);
  assert.deepEqual(capture.channels[2], new Float64Array([4]));
  assert.equal(capture.samplePeriodNs, 1000);
});

test("indexed scope channels retain disabled slots", () => {
  const capture = mapScopeCapture({
    channels: [
      // proto3 omits index zero and false enabled metadata on the wire.
      { enabled: true, values: [1, 2] },
      { index: 1 },
      { index: 2, enabled: true, values: [3] },
    ],
  });

  assert.deepEqual(capture.channels[0], new Float64Array([1, 2]));
  assert.equal(capture.channels[1], null);
  assert.deepEqual(capture.channels[2], new Float64Array([3]));
});

test("scope frame counters remain safe domain numbers", () => {
  const capture = mapScopeCapture({
    generation: "9007199254740991",
    skippedFrames: "2",
    samplePeriodNs: "1000",
  });
  assert.equal(capture.generation, Number.MAX_SAFE_INTEGER);
  assert.equal(capture.skippedFrames, 2);
});
