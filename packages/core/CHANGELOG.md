# @linuxcnc-node/core

## 4.0.0

### Major Changes

- 38b92e5: Require Node.js 24.15 or newer across the published packages and update the
  native build toolchain for the new runtime baseline.

### Patch Changes

- bfedf93: Add `CommandChannel.deleteTool()` to remove tools from the live and persisted tool tables.
- 5a45d8c: Release concrete NML command messages after their synchronous write and track
  asynchronous completion by serial number, preventing invalid deallocation in
  commands such as `teleopEnable(false)`.
- 9d80fbe: Centralize external dependency versions in the pnpm workspace catalog and
  update the shared development and runtime dependency stack.
- Updated dependencies [f6f47c7]
- Updated dependencies [bfedf93]
- Updated dependencies [0f1065a]
- Updated dependencies [38b92e5]
- Updated dependencies [9d80fbe]
  - @linuxcnc-node/types@4.0.0

## 3.2.1

### Patch Changes

- b6f0c1f: Build the core NML addon as a standalone client instead of linking the
  task-oriented `liblinuxcnc.a` archive. This prevents addon-load failures from
  symbols that are only provided by `milltask`.
  - @linuxcnc-node/types@3.2.1

## 3.2.0

### Minor Changes

- absorb eden bridge

### Patch Changes

- Updated dependencies
  - @linuxcnc-node/types@3.2.0

## 3.1.1

### Patch Changes

- unify the packages verions
- Updated dependencies
  - @linuxcnc-node/types@3.1.1

## 3.1.0

### Minor Changes

- command transport

## 3.0.0

### Major Changes

- f959601: Require the repository's patched LinuxCNC baseline and expose spindle speed
  feedback as `motion.spindle[N].feedback`.

### Patch Changes

- Updated dependencies [f959601]
  - @linuxcnc-node/types@3.0.0

## 2.2.2

### Patch Changes

- update to upstream
- Updated dependencies
  - @linuxcnc-node/types@2.2.2

## 2.2.1

### Patch Changes

- Fix native package installs by shipping node-gyp as an install dependency and invoking it directly from lifecycle scripts.
- Updated dependencies
  - @linuxcnc-node/types@2.2.1

## 2.2.0

### Minor Changes

- bump upstream branch

### Patch Changes

- Updated dependencies
  - @linuxcnc-node/types@2.2.0

## 2.1.0

### Minor Changes

- Introduce delta-based API to hal and core-stat

### Patch Changes

- Updated dependencies
  - @linuxcnc-node/types@2.1.0
