# @linuxcnc-node/types

## 5.0.0

### Major Changes

- ecdd07a: Add the transport-independent v5 LinuxCNC domain contract and the initial
  raw `linuxcnc.v1` gRPC client package. Migrate HAL Inspector from copied
  bindings to the generated HAL and scope clients while preserving its UI
  contracts. Keep position-history configuration and clearing on gRPC, move
  renderer telemetry to the daemon's versioned binary WebSocket stream, and keep
  the domain value union aligned with exact 64-bit transport semantics.

### Minor Changes

- f243489: Clarify machine error sequences, support replaying retained errors, and expose
  wrapped LinuxCNC command serials as unsigned 32-bit values.
- 8e4aa21: Expose nine-axis tool wear offsets in status and preserve omitted tool-table
  fields and coordinate tails during partial `setTool` updates. Route tool
  upsert, relocation, and deletion through LinuxCNC-owned transactional NML
  commands with validation, durable persistence, and normal command completion.
  Remote CRUD supports file-backed random and nonrandom tool tables;
  the pinned LinuxCNC build rejects `DB_PROGRAM` during IO initialization.

### Patch Changes

- 4545481: Expose ordered cutter-compensation OFF/LEFT/RIGHT events in G-code preview
  streams so clients can distinguish compensated path segments.

## 4.0.0

### Major Changes

- 38b92e5: Require Node.js 24.15 or newer across the published packages and update the
  native build toolchain for the new runtime baseline.

### Patch Changes

- f6f47c7: Export the `AxisName` type for LinuxCNC coordinate system axes and use it for trajectory `availableAxes`.
- bfedf93: Add `CommandChannel.deleteTool()` to remove tools from the live and persisted tool tables.
- 0f1065a: Expose live, non-consuming snapshots of an in-progress realtime scope capture,
  preserve sparse channel mappings, and recover scope ownership after a stale
  Inspector backend registration. Add incremental scope deltas for efficient
  frontend circular-buffer rendering.
- 9d80fbe: Centralize external dependency versions in the pnpm workspace catalog and
  update the shared development and runtime dependency stack.

## 3.2.1

## 3.2.0

### Minor Changes

- absorb eden bridge

## 3.1.1

### Patch Changes

- unify the packages verions

## 3.0.0

### Major Changes

- f959601: Require the repository's patched LinuxCNC baseline and expose spindle speed
  feedback as `motion.spindle[N].feedback`.

## 2.2.2

### Patch Changes

- update to upstream

## 2.2.1

### Patch Changes

- Fix native package installs by shipping node-gyp as an install dependency and invoking it directly from lifecycle scripts.

## 2.2.0

### Minor Changes

- bump upstream branch

## 2.1.0

### Minor Changes

- Introduce delta-based API to hal and core-stat
