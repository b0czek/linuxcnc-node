import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { executeCommand } from "../dist/command.js";

const schemaRoot = join(import.meta.dirname, "../proto");
const definition = protoLoader.loadSync(
  join(schemaRoot, "linuxcnc/v1/linuxcnc.proto"),
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
const loaded = grpc.loadPackageDefinition(definition);
const executeDefinition =
  loaded.linuxcnc.v1.MachineService.service.ExecuteCommand;

const capturingClient = () => {
  const requests = [];
  const options = [];
  return {
    requests,
    options,
    client: {
      executeCommand(request, optionsOrCallback, maybeCallback) {
        requests.push(request);
        options.push(maybeCallback ? optionsOrCallback : undefined);
        const callback = maybeCallback ?? optionsOrCallback;
        callback(null, { commandSequence: "7", status: 1 });
      },
    },
  };
};

test("executeCommand mechanically encodes the command and wait policy", async () => {
  const { client, requests } = capturingClient();

  const response = await executeCommand(
    client,
    { type: "setSpindleOverride", scale: 1.2, spindleIndex: 0 },
    "accepted",
  );

  assert.deepEqual(response, { commandSequence: "7", status: 1 });
  assert.deepEqual(requests[0], {
    command: "setSpindleOverride",
    setSpindleOverride: { scale: 1.2, spindleIndex: 0 },
    waitPolicy: "WAIT_POLICY_ACCEPTED",
  });
});

test("executeCommand forwards call options", async () => {
  const capture = capturingClient();
  const options = { deadline: new Date("2030-01-01T00:00:00Z") };

  await executeCommand(
    capture.client,
    { type: "abortTask" },
    "completed",
    options,
  );

  assert.equal(capture.options[0], options);
});

test("programOpen passes the ProgramHandle unchanged", async () => {
  const { client, requests } = capturingClient();
  const entry = { workspaceId: "main", relativePath: "part.ngc" };

  await executeCommand(client, { type: "programOpen", entry }, "completed");

  assert.deepEqual(requests[0].programOpen.entry, entry);
  assert.equal(requests[0].waitPolicy, "WAIT_POLICY_COMPLETED");
});

test("optional false and omitted remain distinct on the wire", async () => {
  const { client, requests } = capturingClient();

  await executeCommand(
    client,
    {
      type: "spindleOn",
      speed: 1200,
      spindleIndex: 1,
      waitForSpeed: false,
    },
    "completed",
  );
  await executeCommand(
    client,
    { type: "spindleOn", speed: 1200, spindleIndex: 1 },
    "completed",
  );

  const explicit = executeDefinition.requestDeserialize(
    executeDefinition.requestSerialize(requests[0]),
  );
  const omitted = executeDefinition.requestDeserialize(
    executeDefinition.requestSerialize(requests[1]),
  );
  assert.equal(explicit.spindleOn.waitForSpeed, false);
  assert.equal(explicit.spindleOn._waitForSpeed, "waitForSpeed");
  assert.equal(omitted.spindleOn.waitForSpeed, undefined);
});

test("partial tool updates encode domain positions and preserve fields", async () => {
  const { client, requests } = capturingClient();

  await executeCommand(
    client,
    {
      type: "setTool",
      tool: {
        toolNo: 7,
        diameter: 0,
        offset: new Float64Array([0.25]),
      },
    },
    "completed",
  );

  const decoded = executeDefinition.requestDeserialize(
    executeDefinition.requestSerialize(requests[0]),
  );
  assert.equal(decoded.setTool.tool.toolNo, 7);
  assert.equal(decoded.setTool.tool.diameter, 0);
  assert.equal(decoded.setTool.tool._diameter, "diameter");
  assert.equal(decoded.setTool.tool.pocketNo, undefined);
  assert.deepEqual(decoded.setTool.tool.offset.values, [0.25]);
});
