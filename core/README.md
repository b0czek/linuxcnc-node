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
const rapid = command.setRapidRate(0.5);

await rapid; // waits until LinuxCNC accepts/echoes the command

// Exclusive commands are only available inside exclusive(). The transaction
// auto-drains its own commands through completion in enqueue order. A second
// exclusive() call while one is active rejects instead of queuing stale work.
await command.exclusive((exclusive) => {
  // Immediate commands inside exclusive() are acceptance barriers for later
  // commands in the same callback.
  exclusive.setFeedRate(0.8);
  exclusive.mdi("G1 X10");
  exclusive.mdi("G1 X20");
});

// Await completion explicitly when subsequent JavaScript depends on it.
await command.exclusive(async (exclusive) => {
  const move = exclusive.mdi("G1 X30");
  const accepted = await move;
  console.log(`Accepted as serial ${accepted.serial}`);
  await exclusive.setFeedRate(0.5); // accepted while the move may still be running
  await move.completed;
});

// Configure a default timeout and optionally override one command.
await command.exclusive(
  (exclusive) => {
    exclusive.mdi("G1 X40");
    exclusive.mdi("G1 X50", { timeout: 10000 });
  },
  { timeout: 5000 }
);

// Immediate controls are also available inside exclusive() and remain
// acceptance-only. Preemptive commands are top-level only and cancel active
// exclusive work.
await command.setFeedRate(0.8);
await command.stop();
```

## Documentation

Full API documentation: **[https://b0czek.github.io/linuxcnc-node/](https://b0czek.github.io/linuxcnc-node/)**

## Requirements

- Linux
- LinuxCNC installed and running
- Node.js 18+

## License

GPL-2.0-only
