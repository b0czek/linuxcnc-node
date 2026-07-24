import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["backend/src/backend.ts"],
  outDir: "backend/dist",
  target: "node20",
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ["*.node"],
  noExternal: [/(.*)/],
});
