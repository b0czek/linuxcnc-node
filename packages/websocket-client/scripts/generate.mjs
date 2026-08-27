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
const plugin = join(here, "../node_modules/.bin/protoc-gen-es");

const requireExecutable = (command, args, name) => {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = result.error?.message || result.stderr || result.stdout;
    throw new Error(
      `${name} is required to generate WebSocket protobuf modules${detail ? `: ${detail.trim()}` : ""}`,
    );
  }
};

// Validate the toolchain before removing the last successfully generated files.
requireExecutable("protoc", ["--version"], "protoc");
requireExecutable(plugin, ["--version"], "protoc-gen-es");

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
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
  throw new Error(
    result.error?.message ||
      result.stderr ||
      result.stdout ||
      "protoc-gen-es failed",
  );

const generatedDirectory = join(output, "linuxcnc/v1");
for (const file of readdirSync(generatedDirectory)) {
  if (!file.endsWith("_pb.ts")) continue;
  const path = join(generatedDirectory, file);
  writeFileSync(path, `${readFileSync(path, "utf8").trimEnd()}\n`);
}
