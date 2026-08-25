const fs = require("node:fs");
const path = require("node:path");
const { createLinuxCncClients } = require("@linuxcnc-node/grpc-client");

const protoRoot = path.resolve("backend", "dist", "proto");
const required = [
  "linuxcnc/v1/common.proto",
  "linuxcnc/v1/machine.proto",
  "linuxcnc/v1/program.proto",
  "linuxcnc/v1/hal.proto",
  "linuxcnc/v1/scope.proto",
  "linuxcnc/v1/linuxcnc.proto",
  "grpc/health/v1/health.proto",
  "google/protobuf/empty.proto",
];
for (const relative of required) {
  if (!fs.existsSync(path.join(protoRoot, relative))) {
    throw new Error(`Packaged protobuf asset is missing: ${relative}`);
  }
}

// Loading the generated clients proves that proto-loader can resolve both
// the health service and linuxcnc's google/protobuf import tree. No daemon is
// contacted; grpc-js client construction is sufficient for this assertion.
createLinuxCncClients({ address: "127.0.0.1:50051", protoRoot })
  .then((clients) => {
    for (const client of Object.values(clients)) client.close();
    console.log("grpc-client packaged proto layout: ok");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
