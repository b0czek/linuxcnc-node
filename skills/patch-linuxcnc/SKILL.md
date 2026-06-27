---
name: patch-linuxcnc
description: Use when adding, modifying, or rebasing LinuxCNC patches in linuxcnc-patches/. Covers EMC_STAT/NML changes, parameter mapping, Node.js binding exposure, and verification for the pinned LinuxCNC baseline.
---

# Patching LinuxCNC for linuxcnc-node

This project maintains a patch series in `linuxcnc-patches/` against a pinned
LinuxCNC baseline (`linuxcnc-patches/base-revision`). The Node.js bindings are
ABI-locked to LinuxCNC built with this series applied.

## Baseline

- Repository: https://github.com/LinuxCNC/linuxcnc
- Expected revision: read from `linuxcnc-patches/base-revision`
- Pinned LinuxCNC checkout in this workspace: `linuxcnc/`
- System LinuxCNC used for builds: usually `/home/dariusz/Desktop/linuxcnc`

## Before patching

1. Confirm `linuxcnc/` is at the pinned baseline:
   ```sh
   git -C linuxcnc rev-parse HEAD
   cat linuxcnc-patches/base-revision
   ```
2. If the local `linuxcnc/` checkout is dirty, reset it to the baseline before
   starting a new patch.

## Adding or extending a patch

1. **Pick the next patch number.** Patches are applied in lexical order
   (`0001-...`, `0002-...`). New patches use the next number.

2. **Modify LinuxCNC source** in `linuxcnc/src/`. Common files:
   - `src/emc/nml_intf/emc_nml.hh` — add fields to `EMC_TASK_STAT` or other
     status structures.
   - `src/emc/nml_intf/emc.cc` — add `CMS->update()` / `EmcPose_update()` calls
     in the matching `::update()` method.
   - `src/emc/nml_intf/emcops.cc` — initialize new fields in constructors.
   - `src/emc/task/emctask.cc` — populate fields in `emcTaskUpdate()`.
     Interpreter parameter data is available through the global `_is` pointer
     to `struct setup` (use only after null-check).
   - `src/emc/usr_intf/axis/extensions/emcmodule.cc` — expose new fields in the
     Python `linuxcnc.stat` object if relevant.

3. **Keep parameter mappings accurate.** Common interpreter parameter blocks:
   - G5x offsets + rotations: `#5221–#5390` (20 per system, 9 systems).
     Offset fields occupy `base+0` through `base+8`, rotation is `base+9`.
   - G28 home: `#5161–#5169`.
   - G30 home: `#5181–#5189`.

4. **Update the Node.js bindings** in `core/src/cpp/`:
   - Add delta comparisons in `stat_channel.cc` using the existing macros or a
     new macro if the type pattern is new.
   - `EmcPose` fields need `memcmp` (use `COMPARE_POSE` or
     `COMPARE_ARRAY_MEMCMP`).
   - Scalar arrays can use `COMPARE_SCALAR_ARRAY`.

5. **Update TypeScript types** in `types/src/core.ts` to match the new status
   paths emitted by the addon.

6. **Generate the patch** from a clean LinuxCNC checkout that has all previous
   patches applied. If the local `linuxcnc/` checkout already contains earlier
   patches, generate the diff relative to a commit with those earlier patches
   applied, not relative to the raw baseline. This avoids duplicating prior
   patches in the new patch file.

   ```sh
   git -C linuxcnc diff HEAD -- <changed files> > linuxcnc-patches/000N-<name>.patch
   ```

7. **Add a proper patch header** with `From:`, `Date:`, and `Subject:` lines.

8. **Document the patch** in `linuxcnc-patches/README.md` under the patch
   inventory section.

## Applying the series

From a clean checkout at the pinned baseline:

```sh
./linuxcnc-patches/apply.sh /path/to/linuxcnc
```

The script checks the revision, applies patches in lexical order, and refuses
if a patch does not apply cleanly.

## Verification

1. Apply the complete series to the local `linuxcnc/` checkout.
2. Apply the same series to the system LinuxCNC source used for builds
   (`/home/dariusz/Desktop/linuxcnc` in this workspace).
3. Rebuild LinuxCNC so the shared libraries match the new `EMC_STAT` layout.
4. Build the Node.js bindings:
   ```sh
   pnpm --filter @linuxcnc-node/types build
   pnpm --filter @linuxcnc-node/core build
   ```
5. Run unit tests:
   ```sh
   pnpm --filter @linuxcnc-node/core test:unit
   ```
6. Run integration tests only when a LinuxCNC runtime is available:
   ```sh
   pnpm --filter @linuxcnc-node/core test:integration
   ```

## Rebuilding the series after a baseline bump

If `base-revision` changes, the complete patch series must be rebased against
the new baseline. Validate and, if necessary, regenerate every `*.patch` file
in order. Do not change `base-revision` without rebuilding and testing the
full series.
