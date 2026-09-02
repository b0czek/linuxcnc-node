import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const destinationRoot = join(here, "../proto");
const linuxCncSchemas = [
  "common.proto",
  "machine.proto",
  "program.proto",
  "hal.proto",
  "scope.proto",
  "websocket.proto",
  "linuxcnc.proto",
];
const files = [
  ...linuxCncSchemas.map((file) => [
    join(root, "proto/linuxcnc/v1", file),
    join(destinationRoot, "linuxcnc/v1", file),
  ]),
  [
    join(root, "proto/google/protobuf/empty.proto"),
    join(destinationRoot, "google/protobuf/empty.proto"),
  ],
  [
    join(root, "proto/grpc/health/v1/health.proto"),
    join(destinationRoot, "grpc/health/v1/health.proto"),
  ],
];
for (const [source, destination] of files) {
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(source));
}
console.log(`bundled ${files.length} protobuf sources`);
