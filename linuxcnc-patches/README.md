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

### 0003 — Preserve G96/G97 modal state across task-mode switches

`Interp::synch()` is called on every MANUAL ↔ MDI task-mode transition and at
other interpreter synchronization points. It used to reset
`_setup.spindle_mode[s]` to `SPINDLE_MODE::CONSTANT_RPM` (G97) for every
spindle, even though the motion controller and canon layer retained the CSS
(G96) state. This made the interpreter model diverge from the actual machine
state, so the active-G-code display and subsequent MDI commands behaved as if
G97 were active.

This patch:

- Moves the default G97 initialization from `Interp::synch()` into
  `Interp::init()`, so all spindles start in CONSTANT_RPM at interpreter
  startup.
- Removes the unconditional reset in `Interp::synch()`, letting G96/G97
  survive task-mode switches and MDI command boundaries.
- Updates `Interp::convert_stop()` (M2/M30) to set
  `settings->spindle_mode[s] = SPINDLE_MODE::CONSTANT_RPM` after calling
  `SET_SPINDLE_MODE(s, 0)`, keeping the interpreter model consistent with
  canon when a program ends.

No new `EMC_STAT` fields are added, so no Node.js binding or TypeScript
changes are required.

### 0004 — Resumable Stop for active AUTO programs

Adds a dedicated `EMC_TASK_STOP` command.  By default, Stop decelerates an
active AUTO program without clearing interpreter or motion queues, safely
finishes position-synchronized threading and rigid tapping, stops saved
spindle and coolant outputs, and restores them before Run or Resume continues
the program.  `[TASK]STOP_PRESERVE_PROGRAM = FALSE` restores full-abort Stop
behavior.  Abort, E-stop, faults, mode changes, M0/M1, and Pause retain their
existing behavior.

The command is exposed as Python `command.stop()`, Node
`CommandChannel.stop()`, and `halui.program.stop`.  Stop progress is reported
as `EMC_TASK_STOP_STATE` (`IDLE`, `STOPPING`, `STOPPED`, `STARTING`) through
Python `stop_state` and Node `task.stopState`.  The patch adds a
`tests/resumable-stop` LinuxCNC regression that verifies active AUTO
Stop/Resume preserves the queued program, disables spindle/coolant while
stopped, restores them on Resume, completes the same program, and waits for
active `G33` threading and `G33.1` rigid-tap synchronized motion to finish
before entering `STOPPED`.
