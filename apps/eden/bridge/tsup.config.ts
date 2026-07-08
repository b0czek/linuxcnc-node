import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/backend.ts"],
  outDir: "dist",
  target: "node20",
  format: ["cjs"],
  clean: true,
  sourcemap: true,
  dts: false,
  splitting: false,
  external: ["*.node"],
  // Bundle all dependencies by default
  noExternal: [/(.*)/],
});
