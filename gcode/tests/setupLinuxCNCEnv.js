const os = require("os");
const path = require("path");

process.env.HOME = path.join(
  os.tmpdir(),
  `linuxcnc-node-gcode-${process.getuid?.() ?? "user"}`
);
