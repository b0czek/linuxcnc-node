const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = path.dirname(require.resolve("@linuxcnc-node/hal/package.json", { paths: [root] }));
const input = path.join(source, "build/Release/hal_addon.node");
const output = path.join(root, "build/Release/hal_addon.node");
if (!fs.existsSync(input)) throw new Error(`HAL native addon is not built: ${input}`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(input, output);
console.log(`Copied ${path.basename(output)}`);
