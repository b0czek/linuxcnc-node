# LinuxCNC patch series

`linuxcnc-node` since v3 is purpose-built for LinuxCNC with the patches in this
directory. It is not compatible with an arbitrary stock LinuxCNC build.

## Baseline

The series is based on the LinuxCNC checkout currently used by this workspace:

- Repository: <https://github.com/LinuxCNC/linuxcnc>
- Revision: the commit recorded in [`base-revision`](./base-revision)
- Version line: LinuxCNC 2.10 development

`base-revision` is the single source of truth used by the application script
and CI. CI checks out that exact revision, applies every `*.patch` file in
lexical order, and then builds LinuxCNC and the Node.js bindings. Changing the
baseline requires validating and, if necessary, rebasing the complete series.

## Applying the series

From a clean checkout of the baseline revision:

```sh
./linuxcnc-patches/apply.sh /path/to/linuxcnc
```

The script refuses to patch a different LinuxCNC revision and applies every
`*.patch` file in lexical order. It is safe to run again when the complete
series is already applied, and it does not discard unrelated working-tree
changes.

Patch filenames begin with a sequence number. New patches must use the next
number so their application order remains explicit.

## Patch inventory

### 0001 — Export spindle speed feedback through spindle status

`spindle.N.speed-in` is already sampled by the motion controller into
`emcmotStatus.spindle_status[N].spindleSpeedIn`, but the value stops at the
motion/task boundary. Clients that only consume `EMC_STAT` therefore need a
second HAL connection solely to display actual spindle speed.

This patch adds `feedback` to `EMC_SPINDLE_STAT`, copies `spindleSpeedIn` into
it for every configured spindle, serializes it through NML, and exposes it as
`feedback` in the Python spindle status dictionary. The value is the signed
speed supplied to `spindle.N.speed-in`, converted from revolutions per second
to RPM to match the other spindle status speed fields.

The corresponding `@linuxcnc-node/core` property is
`motion.spindle[N].feedback`. Keeping the feedback in spindle status gives GUI
and remote status consumers one coherent source without requiring direct HAL
access.

### 0002 — Expose interpreter coordinate data in task status

`EMC_TASK_STAT` already carries `g5x_offset` and `rotation_xy` for the
currently active coordinate system, but all other interpreter coordinate data
(G5x rotations, G28/G30 home positions, and the other eight G5x offsets) is
only reachable by syncing the RS274NGC parameter file or triggering a parameter
dump.

This patch adds the following fields to `EMC_TASK_STAT` and populates them
directly from the interpreter's parameter array every task status update:

- `g5x_offsets[9]` — all G5x coordinate system offsets (G54–G59.3)
- `g5x_rotations[9]` — all G5x XY rotation angles (G54–G59.3)
- `g28_position` — G28 home position
- `g30_position` — G30 home position

All pose values are in user units, consistent with the existing `g5x_offset`.
Index 0 of the arrays is G54, index 8 is G59.3. The fields are serialized
through NML and exposed in the Python `linuxcnc.stat` object as
`g5x_offsets`, `g5x_rotations`, `g28_position`, and `g30_position`.

The corresponding `@linuxcnc-node/core` properties are `task.g5xOffsets[N]`,
`task.g5xRotations[N]`, `task.g28Position`, and `task.g30Position`.
