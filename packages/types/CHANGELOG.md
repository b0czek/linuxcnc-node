# @linuxcnc-node/types

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
