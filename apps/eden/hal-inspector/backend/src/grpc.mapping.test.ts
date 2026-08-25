import assert from "node:assert/strict";
import test from "node:test";
import { HalType } from "@linuxcnc-node/grpc-client";
import { domainHalValue, mapScopeCapture, wireHalValue } from "./grpc";

test("HAL 64-bit scalars cross the wire/domain boundary losslessly", () => {
  const signed = wireHalValue("s64", -(1n << 63n));
  const unsigned = wireHalValue("u64", (1n << 64n) - 1n);

  assert.equal(signed.type, HalType.HAL_TYPE_S64);
  assert.equal(unsigned.type, HalType.HAL_TYPE_U64);
  assert.equal(domainHalValue(signed), -(1n << 63n));
  assert.equal(domainHalValue(unsigned), (1n << 64n) - 1n);
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
