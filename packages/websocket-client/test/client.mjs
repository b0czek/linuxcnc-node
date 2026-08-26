import assert from "node:assert/strict";
import test from "node:test";
import {
  openHalValues,
  openPositionHistory,
  openProgramPreview,
  programPreviewUrl,
} from "../dist/index.js";

const concat = (...parts) =>
  Uint8Array.from(parts.flatMap((part) => [...part]));
const varint = (value) => {
  let n = BigInt(value),
    out = [];
  do {
    let b = Number(n & 127n);
    n >>= 7n;
    if (n) b |= 128;
    out.push(b);
  } while (n);
  return out;
};
const field = (number, wire, payload) => [
  ...varint((number << 3) | wire),
  ...payload,
];
const message = (number, payload) =>
  field(number, 2, [...varint(payload.length), ...payload]);
const fixed64 = (value) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, true);
  return [...bytes];
};

class FakeSocket extends EventTarget {
  binaryType = "";
  closes = [];
  close(code, reason) {
    this.closes.push([code, reason]);
  }
  receive(data) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

test("position frames preserve bigint cursors and packed doubles", () => {
  const packed = [...fixed64(1.25), ...fixed64(-2.5)];
  const bytes = concat(
    field(1, 0, varint(2)),
    field(2, 0, varint(2n ** 63n)),
    field(3, 0, varint(9)),
    field(4, 0, varint(10)),
    field(5, 0, varint(1)),
    message(6, packed),
  );
  const socket = new FakeSocket();
  let frame;
  openPositionHistory("ws://localhost", {
    createWebSocket: () => socket,
    onFrame: (value) => (frame = value),
  });
  socket.receive(bytes.buffer);
  assert.equal(frame.kind, "delta");
  assert.equal(frame.generation, 2n ** 63n);
  assert.equal(frame.replacementCount, 1n);
  assert.deepEqual(frame.values, new Float64Array([1.25, -2.5]));
});

test("HAL frames preserve absent values and exact signed/unsigned integers", () => {
  const signed = concat(
    field(1, 0, varint(5)),
    field(6, 0, varint((-5n << 1n) ^ -1n)),
  );
  const unsigned = concat(
    field(1, 0, varint(6)),
    field(7, 0, varint(2n ** 64n - 1n)),
  );
  const entry = (slot, scalar) =>
    message(
      4,
      concat(
        field(1, 0, varint(slot)),
        ...(scalar ? [message(2, scalar)] : []),
      ),
    );
  const bytes = concat(
    field(1, 0, varint(1)),
    field(2, 0, varint(7)),
    field(3, 0, varint(8)),
    entry(1, signed),
    entry(2, unsigned),
    entry(3),
  );
  const socket = new FakeSocket();
  let frame;
  openHalValues("ws://localhost", "token", {
    createWebSocket: () => socket,
    onFrame: (value) => (frame = value),
  });
  socket.receive(bytes.buffer);
  assert.deepEqual(frame, {
    kind: "replacement",
    revision: 7n,
    sequence: 8n,
    entries: [
      { slot: 1, value: -5n },
      { slot: 2, value: 2n ** 64n - 1n },
      { slot: 3 },
    ],
  });
});

test("preview decoder maps positions to Float64Array operations", () => {
  const position = message(
    3,
    message(1, [...fixed64(1), ...fixed64(2), ...fixed64(3)]),
  );
  const operation = concat(
    field(1, 0, varint(1)),
    field(2, 0, varint(42)),
    position,
  );
  const socket = new FakeSocket();
  let event;
  openProgramPreview("ws://localhost", {
    entry: { workspaceId: "workspace", relativePath: "preview.ngc" },
    createWebSocket: () => socket,
    onEvent: (value) => (event = value),
  });
  socket.receive(concat(message(2, message(1, operation))).buffer);
  assert.equal(event.type, "batch");
  assert.equal(event.operations[0].lineNumber, 42);
  assert.deepEqual(event.operations[0].pos, new Float64Array([1, 2, 3]));
});

test("preview URLs safely encode workspace and relative path", () => {
  const url = new URL(
    programPreviewUrl("https://machine.example/base", {
      workspaceId: "space & id",
      relativePath: "dir/a+b #1.ngc",
    }),
  );
  assert.equal(url.protocol, "wss:");
  assert.equal(url.pathname, "/v1/program-preview");
  assert.equal(url.searchParams.get("workspace_id"), "space & id");
  assert.equal(url.searchParams.get("relative_path"), "dir/a+b #1.ngc");
});

test("helpers deliver callbacks, reject malformed frames, and honor abort", () => {
  const socket = new FakeSocket();
  const controller = new AbortController();
  let errors = 0,
    frames = 0;
  openPositionHistory("ws://localhost:50052", {
    signal: controller.signal,
    createWebSocket: () => socket,
    onFrame: () => frames++,
    onError: () => errors++,
  });
  socket.receive(Uint8Array.from([8, 1]).buffer);
  assert.equal(frames, 1);
  socket.receive(Uint8Array.from([0xff]).buffer);
  assert.equal(errors, 1);
  assert.equal(socket.closes.at(-1)[0], 1002);
  controller.abort();
  assert.equal(socket.closes.at(-1)[0], 1000);
});

test("HAL URL accepts the gRPC-returned attachment path", () => {
  const socket = new FakeSocket();
  const handle = openHalValues(
    "http://localhost:50052/root",
    "/v1/hal-values/a%20b",
    {
      createWebSocket: (url) => {
        assert.equal(url, "ws://localhost:50052/v1/hal-values/a%20b");
        return socket;
      },
      onFrame: () => {},
    },
  );
  handle.close();
});
