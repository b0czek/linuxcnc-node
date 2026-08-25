import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const outputArg = process.argv.indexOf("--output");
const output =
  outputArg >= 0 ? process.argv[outputArg + 1] : join(here, "../src/generated");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const plugin = join(here, "../node_modules/.bin/protoc-gen-es");
const result = spawnSync(
  "protoc",
  [
    `--proto_path=${join(root, "proto")}`,
    `--plugin=protoc-gen-es=${plugin}`,
    `--es_out=${output}`,
    "--es_opt=target=ts,import_extension=js,elide_plugin_version=true",
    "linuxcnc/v1/common.proto",
    "linuxcnc/v1/program.proto",
    "linuxcnc/v1/hal.proto",
    "linuxcnc/v1/websocket.proto",
  ],
  { cwd: join(root, "proto"), encoding: "utf8" },
);
if (result.status !== 0)
  throw new Error(result.stderr || result.stdout || "protoc-gen-es failed");

const generatedDirectory = join(output, "linuxcnc/v1");
for (const file of readdirSync(generatedDirectory)) {
  if (!file.endsWith("_pb.ts")) continue;
  const path = join(generatedDirectory, file);
  writeFileSync(path, `${readFileSync(path, "utf8").trimEnd()}\n`);
}
