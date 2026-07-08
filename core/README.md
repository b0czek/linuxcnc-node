# @linuxcnc-node/core

Node.js bindings for the LinuxCNC NML interface. Control and monitor CNC machines running LinuxCNC directly from JavaScript/TypeScript.

## Features

- **StatChannel** - Real-time machine status monitoring with typed property change events
- **CommandTransport** - Raw sent-command transport with echo-serial acceptance and optional completion tracking
- **CommandChannel** - Completion-waiting command API
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

`CommandTransport` models LinuxCNC command acceptance separately from optional command completion. It is intentionally raw binding infrastructure: callers send a native method name and tuple arguments, then layer any policy or scheduling above it.

```typescript
import { CommandTransport } from "@linuxcnc-node/core";

const command = new CommandTransport();
const rapid = command.send("setRapidRate", [0.5]);

await rapid.accepted; // waits until LinuxCNC accepts/echoes the command

const move = command.send("mdi", ["G1 X30"], {
  tracking: "completion",
  completionTimeout: 5000,
});

const accepted = await move.accepted;
console.log(`Accepted as serial ${accepted.serial}`);
await move.completed;
```

## Documentation

Full API documentation: **[https://b0czek.github.io/linuxcnc-node/](https://b0czek.github.io/linuxcnc-node/)**

## Requirements

- Linux
- LinuxCNC installed and running
- Node.js 18+

## License

GPL-2.0-only
