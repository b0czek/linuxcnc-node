const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const appRoot = process.cwd();
const output = fs.mkdtempSync(path.join(os.tmpdir(), "hal-inspector-mappings-"));
const tsc = path.join(appRoot, "node_modules", "typescript", "bin", "tsc");
const testSources = ["grpc.mapping.test.ts", "grpc.runtime.test.ts"].map((file) =>
  path.join(appRoot, "backend", "src", file),
);
const compile = spawnSync(process.execPath, [
  tsc,
  ...testSources,
  "--outDir", output,
  "--target", "ES2022",
  "--module", "commonjs",
  "--moduleResolution", "node",
  "--esModuleInterop",
  "--skipLibCheck",
  "--types", "node",
], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);

for (const file of ["grpc.mapping.test.js", "grpc.runtime.test.js"]) {
  const run = spawnSync(process.execPath, [path.join(output, "backend", "src", file)], {
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: path.join(appRoot, "node_modules") },
  });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
