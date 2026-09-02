import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const output = join(here, "../src/generated");
const generator = join(here, "../node_modules/.bin/proto-loader-gen-types");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const result = spawnSync(
  generator,
  [
    "--longs=String",
    "--enums=Number",
    "--bytes=Buffer",
    "--oneofs",
    "--includeComments",
    "--includeDirs=proto",
    "--outDir",
    output,
    "--grpcLib=@grpc/grpc-js",
    "linuxcnc/v1/linuxcnc.proto",
    "grpc/health/v1/health.proto",
  ],
  { cwd: root, encoding: "utf8", stdio: "pipe" },
);
if (result.status !== 0)
  throw new Error(
    result.stderr || result.stdout || "proto-loader-gen-types failed",
  );

const files = [];
const visit = (directory) => {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, file.name);
    if (file.isDirectory()) visit(path);
    else if (
      file.name.endsWith(".ts") &&
      file.name !== "index.ts" &&
      file.name !== "health.ts"
    )
      files.push(path);
  }
};
visit(output);
files.sort();
const barrel = files
  .map((file) => {
    const specifier = `./${relative(output, file).replaceAll("\\", "/").replace(/\.ts$/, "")}`;
    return `export * from ${JSON.stringify(specifier)};`;
  })
  .join("\n");
writeFileSync(join(output, "index.ts"), `${barrel}\n`);
console.log(`generated ${files.length} protobuf TypeScript files`);
