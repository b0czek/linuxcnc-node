---
name: patch-linuxcnc
description: Use when adding, modifying, or rebasing LinuxCNC patches in linuxcnc-patches/. Covers EMC_STAT/NML changes, parameter mapping, native daemon exposure, and verification for the pinned LinuxCNC baseline.
---

# Patching LinuxCNC for linuxcnc-node

This project maintains a patch series in `linuxcnc-patches/` against a pinned
LinuxCNC baseline (`linuxcnc-patches/base-revision`). The native daemon is
ABI-locked to LinuxCNC built with this series applied.

## Baseline

- Repository: https://github.com/LinuxCNC/linuxcnc
- Expected revision: read from `linuxcnc-patches/base-revision`
- Pinned LinuxCNC checkout in this workspace: `linuxcnc/`
- System LinuxCNC used for builds: usually `/home/dariusz/Desktop/linuxcnc`

## Before patching

1. Materialize the managed patch branch:
   ```sh
   ./linuxcnc-patches/apply.sh linuxcnc
   ```
2. Confirm the checkout is clean and inspect the existing commits:
   ```sh
   git -C linuxcnc status --short
   git -C linuxcnc log --oneline \
     "$(cat linuxcnc-patches/base-revision)..HEAD"
   ```

The tooling refuses dirty, partial, or divergent state. Never reset or discard
an existing dirty checkout automatically. A checkout produced by the legacy
uncommitted workflow can be converted with `apply.sh --adopt linuxcnc`, but
only when its complete tree exactly matches the patch files.

## Adding or extending a patch

1. **Work in commits.** Each patch is exactly one commit on the managed
   `linuxcnc-node/patch-stack` branch. Append a commit for a new patch. To
   change an existing patch, interactively rebase, amend that commit, and
   rebase all later commits. Do not layer changes in the working tree.

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

4. **Update the native daemon mapping** in `native/server/src/` and the
   protobuf contract when the new data crosses the transport boundary.

5. **Update TypeScript types** in `types/src/core.ts` to match the new status
   paths emitted by the daemon.

6. **Commit the LinuxCNC change** with the intended patch author and message,
   then test the clean branch. Refresh every patch file from the linear commit
   history:

   ```sh
   ./linuxcnc-patches/refresh.sh linuxcnc
   ```

   `refresh.sh` preserves existing filenames by ordinal, creates a numbered
   filename for each appended commit, normalizes mail headers with
   `git format-patch`, and verifies a full replay before replacing files. It
   normalizes the branch to the deterministic replayed commit IDs and retains
   the pre-normalization tip under `linuxcnc-node/backups/`.

7. **Document the patch** in `linuxcnc-patches/README.md` under the patch
   inventory section.

## Applying the series

From a clean checkout at the pinned baseline:

```sh
./linuxcnc-patches/apply.sh /path/to/linuxcnc
```

The script checks the revision, validates the entire series in a temporary
worktree, and then creates one commit per patch on
`linuxcnc-node/patch-stack`. Use `--detach` for CI or image builds. If patch
files changed while an older managed branch is checked out, use `--rebuild`;
the script saves the old tip under `linuxcnc-node/backups/` before replacing
it.

## Verification

Never write tests that require hard real-time scheduling, a real-time kernel,
or real-time privileges. All LinuxCNC tests must pass with the userspace
simulator under ordinary POSIX scheduling. Using LinuxCNC's HAL and userspace
real-time process infrastructure is acceptable; depending on deterministic
real-time timing is not.

1. Materialize the complete series and verify the commit count equals the
   patch count:
   ```sh
   ./linuxcnc-patches/apply.sh linuxcnc
   git -C linuxcnc rev-list --count \
     "$(cat linuxcnc-patches/base-revision)..HEAD"
   ```
2. Apply the same series to the system LinuxCNC source used for builds
   (`/home/dariusz/Desktop/linuxcnc` in this workspace).
3. Rebuild LinuxCNC so the shared libraries match the new `EMC_STAT` layout.
4. Build the TypeScript contract and native daemon:
   ```sh
   pnpm --filter @linuxcnc-node/types build
   cmake -S . -B build/native-grpc-linuxcnc \
     -DLINUXCNC_ROOT=/path/to/linuxcnc \
     -DLINUXCNC_GRPC_BUILD_WIRE=ON \
     -DLINUXCNC_GRPC_BUILD_TESTS=ON \
     -DLINUXCNC_GRPC_ENABLE_NML=ON
   cmake --build build/native-grpc-linuxcnc --parallel
   ```
5. Run the native contract and integration tests with the LinuxCNC runtime
   environment sourced:
   ```sh
   ctest --test-dir build/native-grpc-linuxcnc --output-on-failure
   ```

## Rebuilding the series after a baseline bump

If `base-revision` changes, the complete patch series must be rebased against
the new baseline as a linear commit stack, then regenerated with `refresh.sh`.
Do not change `base-revision` without replaying and testing the full series.
