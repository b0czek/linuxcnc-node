# @linuxcnc-node/gcode

G-code file parser for Node.js using LinuxCNC's rs274ngc interpreter. Parse G-code files and extract sequential operations for toolpath visualization.

## Installation

```bash
npm install @linuxcnc-node/gcode
```

## Usage

```typescript
import { parseGCode } from "@linuxcnc-node/gcode";
import { OperationType, PositionIndex } from "@linuxcnc/types";

const result = await parseGCode("/path/to/program.ngc", {
  iniPath: "/path/to/linuxcnc.ini",
  onProgress: (p) => console.log(`${p.percent}% - ${p.operationCount} ops`),
});

console.log(`Parsed ${result.operations.length} ops`, result.extents);

const { X, Y, Z } = PositionIndex;
for (const op of result.operations) {
  if (op.type === OperationType.TRAVERSE) {
    console.log(`Rapid to ${op.pos[X]}, ${op.pos[Y]}, ${op.pos[Z]}`);
  } else if (op.type === OperationType.FEED) {
    console.log(`Feed to ${op.pos[X]}, ${op.pos[Y]} @ F${op.feedRate}`);
  }
}
```

## API

### `parseGCode(filepath, options)`

Returns `Promise<GCodeParseResult>`.

**Options (`ParseOptions`):**

- `iniPath`: Path to LinuxCNC INI file (required)
- `onProgress`: Callback `(progress: ParseProgress) => void`
- `progressUpdates`: Target number of progress updates (default: 40, set to 0 to disable)

### Types

#### Operation Types

| Type           | Description           |
| -------------- | --------------------- |
| `TRAVERSE`     | G0 rapid motion       |
| `FEED`         | G1 linear feed motion |
| `ARC`          | G2/G3 arc motion      |
| `PROBE`        | G38.x probe motion    |
| `RIGID_TAP`    | G33.1 rigid tapping   |
| `DWELL`        | G4 pause              |
| `NURBS_G5/G6`  | NURBS curves          |
| `UNITS_CHANGE` | G20/G21               |
| `PLANE_CHANGE` | G17/G18/G19           |
| `TOOL_CHANGE`  | M6                    |

(See `types.ts` for full list including offsets and rotations)

## Requirements

- Linux
- LinuxCNC installed (provides rs274ngc interpreter library)
- Node.js 18+

## Building from Source

Requires LinuxCNC development headers. Set `LINUXCNC_INCLUDE` environment variable if headers are not in standard location.

```bash
export LINUXCNC_INCLUDE=/path/to/linuxcnc/include
npm install
npm run build
```

## License

GPL-2.0-only
