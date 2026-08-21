# Native gRPC cutover handoff

Last verified: 2026-08-21

## Objective

Finish the repository-side migration to one standalone C++17
`linuxcnc-grpc-server`, while preserving `@linuxcnc-node/types` as the stable,
transport-independent domain package and exposing only raw generated clients
from `@linuxcnc-node/grpc-client`.

This repository is disjoint from Seraph/CTRL. Do not copy Seraph source,
fixtures, type tests, or compatibility files into this repository. Seraph will
be migrated by a separate agent in its own workspace after the native boundary
is ready.

## Non-negotiable boundaries

- Do not modify the user's existing uncommitted patch-series work:
  - `linuxcnc-patches/README.md`
  - `linuxcnc-patches/apply.sh`
  - `linuxcnc-patches/0009-threading-stop-clear-and-pass-stepping.patch`
  - `.worktrees/`
  - the `linuxcnc` symlink
- Do not add anything sourced from Seraph or CTRL. In particular,
  `packages/types/test/seraph-compatibility.ts` must not exist.
- Do not delete the legacy TypeScript/N-API/Eden packages yet. Their atomic
  removal is gated on external Seraph parity.
- Do not add Docker/image construction or publishing work.
- Preserve protobuf field numbers, reserved fields/names, enum values, command
  cases, and stable domain shapes.
- `@linuxcnc-node/types` must never depend on protobuf, gRPC, native addons, or
  `@linuxcnc-node/grpc-client`.
- Add or update a Changeset for every completed task that affects publishable
  packages, as required by `AGENTS.md`.
- Preserve unrelated dirty-worktree changes. Do not reset or clean the tree.

## Implemented state

### Wire and TypeScript boundary

- `proto/linuxcnc/v1/linuxcnc.proto` is the `linuxcnc.v1` wire source of truth.
- Machine, Program, HAL, and Scope services are defined.
- The command oneof contains all 51 working command cases.
- Status deltas are typed, sparse, atomic per observed status, and do not use
  string paths, JSON, or `Any`.
- `@linuxcnc-node/types` contains generated stable enums/constants and layered
  TypeScript-only domain utilities.
- `@linuxcnc-node/grpc-client` is a raw generated client/messages package at
  version `1.0.0`.
- Deterministic generation and conformance checks cover enum numbers, command
  cases, reserved fields, unknown-field compatibility, binary fixtures,
  packed positions, and exact 64-bit HAL values.
- HAL Inspector uses raw HAL and Scope gRPC clients while preserving its
  backend/frontend IPC contract and typed-array behavior.

### Native server

- Root CMake builds the C++17 domain library, protobuf library, daemon, and
  tests against the pinned patched LinuxCNC tree.
- The standalone daemon no longer sources implementation units from
  `packages/core` or `packages/gcode`.
- NML status/command/error handling and one serialized command queue are
  implemented.
- Cancellation drops a command only while it is still queued. Once LinuxCNC
  accepts it, cancellation stops the RPC wait but does not report false
  completion or undo the command.
- Program workspaces enforce safe relative paths, quotas, TTLs, active pinning,
  and atomic materialization into the configured active program directory.
- The rs274 parser is serialized, streams bounded batches, and checks
  cancellation between interpreter steps.
- Position history supports packed snapshots, deltas, replacement after
  rollover, generations, and continuous streaming.
- HAL uses the real LinuxCNC repository for topology, exact scalar reads and
  writes, signals, message level, metadata, and stream-owned components.
- Scope uses real HAL/shared memory, loads `scope_rt` without a shell on first
  use, permits one controller, and implements one in-flight plus one coalesced
  pending frame with ACK/generation/skipped-frame tracking.
- Health is always enabled; reflection is opt-in. TLS/mTLS and unsafe
  non-loopback plaintext policy are implemented.
- gRPC send/receive sizes and server thread resources are bounded.
- Every RPC uses the gRPC callback API and is owned by a transport-neutral
  active-callback registry. Service shutdown rejects new callbacks, cancels
  in-flight native work, detaches subscriptions, schedules reserved cleanup,
  and finishes callbacks with `UNAVAILABLE` without relying on the server
  deadline. The five-second gRPC deadline remains only as a catastrophic
  fallback.

### Important defect already fixed

`LinuxCncHalAdapter::topology()` previously dereferenced
`hal_funct_t::runtime` and `hal_thread_t::runtime`. Those are process-local
pointers written by the realtime component and caused the standalone daemon to
segfault during real topology traversal. The adapter now resolves the exported
`<name>.time` HAL pins and reads their shared values instead. Do not restore
direct pointer dereferences.

### Live test harness

`native/server/tests/run_grpc_live_smoke.sh` launches an isolated RIP LinuxCNC
simulation with unique NML keys and ports. It:

- refuses to run if a lock, HAL shared-memory runtime, or LinuxCNC singleton
  process already exists;
- uses bounded readiness and client deadlines;
- terminates process-group and separately sessioned daemon survivors;
- removes only its unique NML keys and singleton HAL/RTAPI state that did not
  predate the test;
- leaves no `linuxcncsvr`, `milltask`, `rtapi_app`, lock, or HAL shared memory.

The live C++ smoke currently proves:

- complete real status availability;
- accepted and completed command waits;
- representative completed waits across task, trajectory, jog, spindle,
  coolant, tool, I/O, debug, and operator-message command families;
- invalid empty-command rejection;
- atomic sparse replay after a command;
- ESTOP reset, machine on, MDI mode, and an actual `G0 X1` move;
- packed position snapshots and a real changed-position delta;
- position-history clear, generation change, and empty reset behavior;
- workspace creation/upload/deletion;
- real serialized rs274 progress/batches/final summary;
- real HAL topology and typed reads;
- exact signed and unsigned 64-bit signal write/read round trips;
- HAL writer-ready `true`/`false` transitions and signal conflict rejection;
- client-owned component pin deltas and cleanup after stream close;
- client-owned component cleanup after abrupt RPC cancellation;
- scope acquisition and second-controller `RESOURCE_EXHAUSTED` behavior.
- a real HAL mutation advances `WatchTopology` with the newly created typed
  item;
- a deliberately unacknowledged Scope roll frame is replaced by a newer
  generation with nonzero skipped-frame accounting;
- SIGTERM finishes simultaneous Machine error watch, partial upload, queued
  parses, HAL topology watch, owned HAL component, and acquired Scope session
  without `DEADLINE_EXCEEDED`, and the daemon exits within two seconds;
- shutdown removes the stream-owned HAL component and pin while LinuxCNC stays
  running, and a restarted daemon can recreate that owner and reacquire Scope.

The native callback event loop is complete. Every RPC has explicit callback
ownership, normal shutdown is independent of the five-second gRPC safety
deadline, and both contract-only and real-LinuxCNC shutdown acceptance cover
the lifecycle boundary.

If this test reports CTest status `Skipped`, first close any running LinuxCNC
instance. The harness intentionally will not disturb it.

## Verified commands and results

The following were green at handoff:

```sh
cmake --build /tmp/linuxcnc-grpc-linuxcnc-build -j2
ctest --test-dir /tmp/linuxcnc-grpc-linuxcnc-build --output-on-failure
```

Result: 8/8 tests passed, including the live LinuxCNC smoke.

```sh
cmake --build /tmp/linuxcnc-grpc-contract-build -j2
ctest --test-dir /tmp/linuxcnc-grpc-contract-build --output-on-failure
```

Result: 6/6 tests passed, including the contract loopback smoke.

```sh
pnpm run typecheck
pnpm run test:contracts
pnpm --filter @linuxcnc-node/hal-inspector test
pnpm --filter @linuxcnc-node/hal-inspector build
pnpm --filter @linuxcnc-node/hal-inspector package
git diff --check
```

All passed. HAL Inspector packaged successfully as
`apps/eden/hal-inspector/hal-inspector.edenite`.

The live test was also followed by a host-state check confirming no test
daemon, `/tmp/linuxcnc.lock`, or singleton HAL/RTAPI shared-memory key remained.

## Changeset state

`.changeset/bright-grpc-contract.md` currently declares:

- `@linuxcnc-node/types`: major
- `@linuxcnc-node/hal-inspector`: major
- `@linuxcnc-node/eden-protocol`: patch, for the temporary exact-width HAL
  value union until atomic removal

The new `@linuxcnc-node/grpc-client` package starts at `1.0.0` and therefore
does not need a version-bump entry merely to introduce it.

Other pre-existing Changesets also affect legacy packages. Do not delete or
rewrite them without establishing ownership and intent.

## Remaining repository work

These are suitable bounded tasks for a lower-reasoning implementation agent.
Keep additions native and table-driven where possible.

1. Complete the live command matrix beyond the current representatives.
   - Add the remaining stateful program, trajectory, jog, spindle, coolant,
     tool-mutation, I/O, and operator-error/display variants.
   - Verify accepted/completed waits, invalid preconditions, cancellation, and
     timeout behavior.
   - Keep command cases generated from or checked against the protobuf oneof;
     do not create a second hand-maintained command catalog.

2. Expand workspace integration coverage beyond event-loop acceptance.
   - Sliding TTL and expiry.
   - Active-workspace pinning through program open/close.
   - Companion subroutines in nested safe paths.
   - Absolute path, traversal, symlink, executable, empty upload, per-workspace
     quota, and total-quota rejection.
   - Materialization failure must leave the previous active tree intact.

3. Expand position-history live coverage.
   - Cursor replay.
   - Capacity rollover and replacement batches.
   - Slow-reader skipped-batch accounting where applicable.

4. Expand HAL integration coverage beyond the completed topology watch.
   - Writable versus writer-owned rejection.
   - Component pin and parameter direction/type validation.
   - Message-level behavior.

5. Expand scope integration coverage beyond shutdown/reacquisition and the
   completed slow-reader frame-coalescing check.
   - Configure against `servo-thread` and real HAL sources.
   - Run, single, roll, stop, and trigger flows.

6. Keep CI deterministic.
   - The live harness must remain bounded and must skip rather than disrupt an
     existing LinuxCNC instance.
   - Do not introduce unbounded queues, sleeps longer than the test deadline,
     or reliance on external fixtures.

## Work that should remain with a higher-reasoning owner

- Any incompatible protobuf change, field renumbering, or domain-type shape
  decision.
- The compatibility boundary and sequencing of the atomic legacy deletion.
- The external Seraph/Noah migration and AppBus design.

## External Seraph handoff gate

The native boundary is ready. The next task belongs in the separate Seraph/CTRL
workspace and should:

- keep existing `@linuxcnc-node/types` imports;
- make Noah the sole machine-control gRPC client;
- map Noah's command tuples to protobuf oneof cases only at dispatch;
- reconstruct Noah's existing path subscriptions from typed status deltas;
- upload program workspaces for preview/execution;
- collect streamed parser batches only where a complete `GCodeParseResult` is
  locally required;
- decode packed position batches to the existing `Float64Array` layout;
- move operator-panel preview and live-position access behind Noah AppBus;
- migrate no Seraph source or fixtures into this repository.

Only after HAL Inspector and external Seraph pass end to end should this repo
delete `packages/core`, `packages/gcode`, `packages/hal`,
`packages/eden-protocol`, `apps/eden/bridge`, their N-API build files, node-gyp,
and Node native runtime dependencies in one atomic cutover.

## Useful entry points

- Wire contract: `proto/linuxcnc/v1/linuxcnc.proto`
- Native build: `CMakeLists.txt`, `native/server/CMakeLists.txt`
- Server services: `native/server/src/grpc_server.cc`
- NML adapter: `native/server/src/nml_adapter.cc`
- HAL adapter: `native/server/src/hal_adapter.cc`
- Scope controller: `native/server/src/scope_controller.cc`
- Workspace store: `native/server/src/program_workspace.cc`
- Position history: `native/server/src/position_history.cc`
- Live client: `native/server/tests/grpc_live_smoke.cc`
- Live runner: `native/server/tests/run_grpc_live_smoke.sh`
- Contract generation: `packages/types/scripts/`,
  `packages/grpc-client/scripts/`
- HAL Inspector boundary: `apps/eden/hal-inspector/backend/src/grpc.ts`
- Architecture notes: `docs/grpc-cutover.md`
