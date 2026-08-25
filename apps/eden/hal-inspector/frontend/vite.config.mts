import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  base: "./",
  plugins: [solid()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: resolve(root, "index.html") },
  },
  resolve: { conditions: ["development", "browser"] },
});
