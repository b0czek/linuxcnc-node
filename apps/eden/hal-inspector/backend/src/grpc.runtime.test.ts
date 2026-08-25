import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createLinuxCncClients } from "@linuxcnc-node/grpc-client";
import { readGrpcConfig } from "./config";

test("configured protoRoot loads the packaged grpc and health clients", async () => {
  const protoRoot = resolve(process.cwd(), "backend/dist/proto");
  const config = readGrpcConfig({
    LINUXCNC_GRPC_ENDPOINT: "127.0.0.1:50051",
    LINUXCNC_GRPC_PROTO_ROOT: protoRoot,
  });
  assert.equal(config.protoRoot, protoRoot);
  assert.equal(config.protoPath, undefined);

  const clients = await createLinuxCncClients({
    address: config.address,
    protoRoot: config.protoRoot,
  });
  assert.ok(clients.health);
  assert.ok(clients.hal);
  for (const client of Object.values(clients)) client.close();
});
