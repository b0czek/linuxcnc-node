import { defineConfig } from "vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

export default defineConfig({
  plugins: [
    electron([
      {
        // Main-Process entry file of the Electron App.
        entry: "src/main/main.ts",
        vite: {
          build: {
            rollupOptions: {
              external: ["@linuxcnc-node/gcode"],
            },
          },
        },
      },
      {
        entry: "src/preload/preload.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            rollupOptions: {
              external: ["@linuxcnc-node/gcode"],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
});
