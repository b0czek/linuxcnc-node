import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const checkedIn = join(here, "../src/generated");
const generator = join(here, "../node_modules/.bin/proto-loader-gen-types");

const filesUnder = (directory) => {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".ts") && entry.name !== "index.ts") files.push(path);
    }
  };
  visit(directory);
  return files.sort();
};

const tempRoot = mkdtempSync(join(tmpdir(), "linuxcnc-grpc-generated-"));
try {
  const result = spawnSync(generator, [
    "--longs=String",
    "--enums=Number",
    "--bytes=Buffer",
    "--oneofs",
    "--includeComments",
    "--includeDirs=proto",
    "--outDir", tempRoot,
    "--grpcLib=@grpc/grpc-js",
    "linuxcnc/v1/linuxcnc.proto",
    "grpc/health/v1/health.proto",
  ], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "proto-loader-gen-types failed");

  const expected = filesUnder(tempRoot);
  const actual = filesUnder(checkedIn);
  const expectedNames = expected.map((file) => relative(tempRoot, file));
  const actualNames = actual.map((file) => relative(checkedIn, file));
  if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
    throw new Error(`generated file set differs\nexpected: ${expectedNames.join(", ")}\nactual: ${actualNames.join(", ")}`);
  }
  for (let i = 0; i < expected.length; i += 1) {
    const expectedBytes = readFileSync(expected[i]);
    const actualBytes = readFileSync(actual[i]);
    if (!expectedBytes.equals(actualBytes)) throw new Error(`generated output differs: ${expectedNames[i]}`);
  }

  const expectedBarrel = expectedNames.filter((file) => file !== "health.ts").map((file) => `export * from "./${file.replaceAll("\\", "/").replace(/\.ts$/, "")}";`).join("\n") + "\n";
  const actualBarrel = readFileSync(join(checkedIn, "index.ts"), "utf8");
  if (actualBarrel !== expectedBarrel) throw new Error("generated output differs: index.ts");
  console.log(`generated grpc output is deterministic (${expected.length} files)`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
