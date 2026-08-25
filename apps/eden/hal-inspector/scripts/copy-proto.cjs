const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.dirname(
  require.resolve("@linuxcnc-node/grpc-client/package.json"),
);
const source = path.join(packageRoot, "proto");
const destination = path.resolve("backend", "dist", "proto");
const required = [
  "linuxcnc/v1/common.proto",
  "linuxcnc/v1/machine.proto",
  "linuxcnc/v1/program.proto",
  "linuxcnc/v1/hal.proto",
  "linuxcnc/v1/scope.proto",
  "linuxcnc/v1/websocket.proto",
  "linuxcnc/v1/linuxcnc.proto",
  "grpc/health/v1/health.proto",
  "google/protobuf/empty.proto",
];

for (const relative of required) {
  if (!fs.existsSync(path.join(source, relative))) {
    throw new Error(
      `grpc-client package is missing required protobuf asset: ${relative}`,
    );
  }
}

fs.cpSync(source, destination, { recursive: true });
for (const relative of required) {
  if (!fs.existsSync(path.join(destination, relative))) {
    throw new Error(`Failed to package required protobuf asset: ${relative}`);
  }
}
