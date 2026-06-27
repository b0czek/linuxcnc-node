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
