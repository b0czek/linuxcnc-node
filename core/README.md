# @linuxcnc-node/core

Node.js bindings for the LinuxCNC NML interface. Control and monitor CNC machines running LinuxCNC directly from JavaScript/TypeScript.

## Features

- **StatChannel** - Real-time machine status monitoring with typed property change events
- **CommandChannel** - Send commands to LinuxCNC (MDI, program control, jogging, tool changes, etc.)
- **ErrorChannel** - Receive error and operator messages from LinuxCNC
- **PositionLogger** - High-frequency position logging for toolpath visualization

## Installation

```bash
npm install @linuxcnc-node/core
```

## Quick Start

```typescript
import {
  StatChannel,
  CommandChannel,
  TaskMode,
  TaskState,
} from "@linuxcnc-node/core";

const stat = new StatChannel();
const cmd = new CommandChannel();

// Watch for position changes
stat.on("motion.traj.actualPosition", (pos) => {
  console.log(`X=${pos.x} Y=${pos.y} Z=${pos.z}`);
});

// Send commands
await cmd.setState(TaskState.ON);
await cmd.setTaskMode(TaskMode.MDI);
await cmd.executeMdi("G0 X10 Y10");

// Cleanup
stat.destroy();
```

## Documentation

Full API documentation: **[https://b0czek.github.io/linuxcnc-node/](https://b0czek.github.io/linuxcnc-node/)**

## Requirements

- Linux
- LinuxCNC installed and running
- Node.js 18+

## License

GPL-2.0-only
