# @linuxcnc-node/core

Node.js bindings for the LinuxCNC NML interface. Control and monitor CNC machines running LinuxCNC directly from JavaScript/TypeScript.

## Features

- **StatChannel** - Real-time machine status monitoring with typed property change events
- **CommandChannelV2** - Recommended command API with explicit acceptance and completion waits
- **CommandChannel** - Legacy completion-waiting command API for compatibility
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
  PositionIndex,
} from "@linuxcnc-node/core";

const stat = new StatChannel();
const cmd = new CommandChannel();

// Watch for position changes
stat.on("motion.traj.actualPosition", (pos) => {
  // pos is now a Float64Array(9) - destructure index for readable access
  const { X, Y, Z } = PositionIndex;
  console.log(`X=${pos[X]} Y=${pos[Y]} Z=${pos[Z]}`);
});

// Send commands
await cmd.setState(TaskState.ON);
await cmd.setTaskMode(TaskMode.MDI);
await cmd.executeMdi("G0 X10 Y10");

// Cleanup
stat.destroy();
```

## Command Lifecycle

`CommandChannelV2` models LinuxCNC command acceptance separately from command completion:

```typescript
import { CommandChannelV2 } from "@linuxcnc-node/core";

const command = new CommandChannelV2();
const cmd = command.mdi("G1 X10");

await cmd; // waits until LinuxCNC accepts/echoes the command

await command.withLock(async (locked) => {
  await locked.mdi("G1 X10").wait({ timeout: 5000 }); // waits for completion under exclusive command access
});
```

## Documentation

Full API documentation: **[https://b0czek.github.io/linuxcnc-node/](https://b0czek.github.io/linuxcnc-node/)**

## Requirements

- Linux
- LinuxCNC installed and running
- Node.js 18+

## License

GPL-2.0-only
