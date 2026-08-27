# Native LinuxCNC gRPC server foundation

`linuxcnc-grpc-domain` contains transport-neutral C++20 building blocks for
the standalone daemon: serialized command coordination, typed status replay,
bounded position history, exact-width HAL values, secure program workspaces,
and exclusive/coalesced scope frames. These classes do not include Node,
protobuf, or gRPC headers.

With `LINUXCNC_GRPC_BUILD_WIRE=ON`, `linuxcnc-grpc-server` is a real listener:
it registers the generated `linuxcnc.v1` Machine, Program, HAL, and Scope
services, enables standard gRPC health, optionally enables reflection, and
supports plaintext/TLS/mTLS credentials. The NML adapter mechanically maps all
51 command oneof cases, including spindle indices, tool offsets/wear, operator
messages, and workspace-materialized program opens. It publishes the complete
status surface extracted from the pinned LinuxCNC status structures and emits
typed task, trajectory, joint/axis/spindle, I/O, and tool-table deltas. Live
CTest validation launches an isolated pinned-LinuxCNC simulation and exercises
real status, accepted/completed commands, sparse replay, MDI-backed packed
position deltas, workspace upload and rs274 parsing, exact 64-bit HAL values,
client-component cleanup, and exclusive scope ownership. The harness refuses
to start when another LinuxCNC/HAL runtime exists and reclaims only the runtime
and NML resources it created.

## Protobuf WebSocket data plane

Position-history configuration and clearing remain on `MachineService` through
`ConfigurePositionHistory` and `ClearPositionHistory`. Telemetry is published
directly to renderers at `ws://127.0.0.1:50052/v1/position-history` by default;
set `--telemetry-endpoint=HOST:PORT` to change the shared listener. This
read-only telemetry listener is always a plaintext `ws://` endpoint; `--tls`
and `--mtls` secure only the gRPC control plane. A non-loopback telemetry bind
requires `--unsafe-non-loopback`.

The application protocol is server-to-client only. Client data messages close
the connection with WebSocket policy error 1008. Every binary WebSocket
message contains exactly one protobuf message from
`proto/linuxcnc/v1/websocket.proto`; the route determines its concrete type:

- `/v1/position-history` uses `PositionHistoryFrame`.
- `/v1/hal-values/{token}` uses `HalValueFrame`.
- `/v1/program-preview?workspace_id=…&relative_path=…` uses
  `ProgramPreviewEvent`.

There is no custom header or top-level envelope. Position connections begin
with a replacement followed by deltas. A clear, reconfiguration, generation
change, or retention rollover produces another replacement. Values retain the
stable ten-double X, Y, Z, A, B, C, U, V, W, motion-type layout.

HAL value telemetry uses the same listener. Create and update a subscription
with `HalService.CreateValueSubscription` and `UpdateValueSubscription`, then
attach the returned single-use path at `/v1/hal-values/{token}`. Configuration
changes preserve the socket and advance its revision; the first frame for each
revision is a complete replacement. `DeleteValueSubscription` and WebSocket
disconnects release the subscription.

HAL frames contain slot/value entries. An absent `HalScalar` marks a slot as
temporarily unavailable; `s64`, `u64`, revisions, and sequences remain exact
64-bit integers.
Position history keeps its acquisition cadence while coalescing mutations into
50 ms delivery windows for viewers. Slow consumers receive coalesced
latest-state deltas rather than every sampled transition. Client WebSocket
messages are forbidden on both telemetry routes.

The HAL service uses the pinned LinuxCNC HAL runtime for topology, exact
scalar reads/writes, signals, and session-owned components. The scope service
loads `scope_rt` on first use when needed, attaches its sampling function to
the configured thread, and keeps shared-memory polling off the realtime path.
Workspace paths are validated and materialized on the serialized NML command
worker into the configured active program directory, with active-workspace
pinning reconciled against LinuxCNC status.

With wire generation disabled, CMake builds the transport-neutral domain
library without creating a server executable.

Wire generation is the default and requires the complete pinned LinuxCNC NML,
rs274, HAL, and scope integrations. Pass `-DLINUXCNC_GRPC_BUILD_WIRE=OFF` for
an explicit domain-only build.

## Native code quality

Formatting and static analysis are pinned to Clang 21. Install
`clang-format-21`, `clang-tidy-21`, and `run-clang-tidy-21`, then run the
formatting workflow from the repository root:

```sh
pnpm format:native
pnpm check:native:format
```

Clang-Tidy consumes a CMake compilation database, so configure and build the
same feature set that you want to analyze before invoking it. For example, the
domain-only workflow is:

```sh
cmake -S . -B build/native-grpc \
  -DLINUXCNC_GRPC_BUILD_WIRE=OFF \
  -DLINUXCNC_GRPC_ENABLE_NML=OFF \
  -DLINUXCNC_GRPC_BUILD_TESTS=ON \
  -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
  -DCMAKE_BUILD_TYPE=Debug
cmake --build build/native-grpc --parallel
pnpm lint:native build/native-grpc
ctest --test-dir build/native-grpc --output-on-failure
```

For full runtime coverage, configure a second build with
`LINUXCNC_GRPC_ENABLE_NML=ON` and `LINUXCNC_ROOT` set to the built, pinned
LinuxCNC checkout, again exporting the compilation database. The lint wrapper
only selects repository-owned files below `native/server`; generated
protobuf/gRPC sources, the LinuxCNC checkout, system headers, caches, and build
trees remain outside the analysis pipeline.

Wire builds also install `linuxcnc-grpc-health-check`. It calls the standard
gRPC health service at `127.0.0.1:50051` by default, or at the endpoint passed
as its first argument, and exits nonzero unless the server reports `SERVING`.
For TLS, pass `--tls-ca=PATH`; mTLS additionally accepts
`--tls-certificate=PATH` and `--tls-private-key=PATH`. The equivalent
`LINUXCNC_GRPC_TLS_CA`, `LINUXCNC_GRPC_TLS_CERT`, and
`LINUXCNC_GRPC_TLS_KEY` environment variables are read automatically, so the
Docker health check inherits the same client credentials as the container.
Use `--tls-server-name=NAME` or `LINUXCNC_GRPC_TLS_SERVER_NAME` when the
certificate identity differs from the health-check endpoint.

## Program preview WebSocket stream

Program preview is a finite WebSocket stream for any safe uploaded workspace
entry, whether or not LinuxCNC has loaded it. A successful stream contains zero or more
coalesced `progress` events and ordered, nonempty `batch` events, followed by
exactly one terminal `summary`. The summary carries the authoritative extents
and total operation count. An `error` event is terminal for an interpreter
failure.

Each batch contains at most `--gcode-batch-size` operations (128 by default).
The final partial batch is sent before the summary. The server retains at most
two encoded batches ahead of the active write, so a slow client applies
backpressure to the serialized interpreter instead of growing an unbounded
preview in daemon memory. Progress may be coalesced under load; operation
batches are never coalesced or discarded.

Clients should append `batch.operations` as events arrive and use the summary
to finalize camera fitting or other whole-program state. Cancelling or closing
the WebSocket stops interpretation at the next interpreter-step boundary, releases
the workspace lease, and does not emit a success summary.
