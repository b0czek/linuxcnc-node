# @linuxcnc-node/gcode

G-code file parser for Node.js using LinuxCNC's rs274ngc interpreter. Parse G-code files and extract sequential operations for toolpath visualization.

## Installation

```bash
npm install @linuxcnc-node/gcode
```

## Usage

```typescript
import { parseGCode, OperationType } from "@linuxcnc-node/gcode";

const result = await parseGCode("/path/to/program.ngc", {
  iniPath: "/path/to/linuxcnc.ini",
  onProgress: (p) => console.log(`${p.percent}%`),
});

console.log(`Parsed ${result.operations.length} ops`, result.extents);

for (const op of result.operations) {
  if (op.type === OperationType.TRAVERSE) {
    console.log(`Rapid to ${op.end.x}, ${op.end.y}, ${op.end.z}`);
  } else if (op.type === OperationType.FEED) {
    console.log(`Feed to ${op.end.x}, ${op.end.y} @ F${op.feedRate}`);
  }
}
```

## API

### `parseGCode(filepath, options)`

Returns `Promise<GCodeParseResult>`.

**Options:**

- `iniPath`: Path to LinuxCNC INI file (required)
- `onProgress`: Callback `(progress: { percent: number, operationCount: number }) => void`

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
