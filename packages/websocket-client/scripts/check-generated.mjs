import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "linuxcnc-websocket-generated-"));
try {
  const output = join(temporary, "generated");
  const result = spawnSync(process.execPath, [
    join(here, "generate.mjs"),
    "--output",
    output,
  ]);
  if (result.status !== 0)
    throw result.error ?? new Error("WebSocket schema generation failed");
  const expectedRoot = join(here, "../src/generated");
  const files = (root) =>
    readdirSync(join(root, "linuxcnc/v1"))
      .filter((name) => name.endsWith("_pb.ts"))
      .sort();
  assert.deepEqual(files(output), files(expectedRoot));
  for (const file of files(output))
    if (
      !readFileSync(join(output, "linuxcnc/v1", file)).equals(
        readFileSync(join(expectedRoot, "linuxcnc/v1", file)),
      )
    )
      throw new Error(`generated WebSocket protobuf module differs: ${file}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
