# Native gRPC architecture

`linuxcnc-grpc-server` is the only supported transport process in the native
architecture. One daemon is attached to one patched LinuxCNC instance and
serves the versioned `linuxcnc.v1` API. It owns the NML command, status, and
error channels, the rs274 interpreter, HAL access, position history, scope
shared memory, and uploaded-program workspaces.

The protobuf files under `proto/linuxcnc/v1` are the wire source of truth, and
`linuxcnc.proto` is the import-only aggregate entrypoint.
Wire messages use typed fields and oneofs: the protocol does not use JSON,
`google.protobuf.Any`, or string property paths. Removed fields are reserved,
field numbers are never reused, and domain enum numbers remain equal to the
runtime values exported by `@linuxcnc-node/types`.

## Package boundary

- `@linuxcnc-node/types` contains transport-independent domain models,
  constants, command tuple types, and typed-array layouts. It does not import
  protobuf, gRPC, or `@linuxcnc-node/grpc-client`.
- `@linuxcnc-node/grpc-client` contains generated wire messages and raw Node
  clients. It does not expose EventEmitter wrappers, property watchers, HAL
  objects, or machine policy.
- Consumers perform wire-to-domain conversion only at their boundary. Packed
  position and scope data become the existing `Float64Array` representations
  there.

The stable position layout is ten `float64` values per point in X, Y, Z, A, B,
C, U, V, W, motion-type order. HAL `s64` and `u64` values remain integer wire
values; clients must not coerce them through an unsafe JavaScript `number`.

## Services

`MachineService` provides complete status, replayable typed sparse status
deltas, a complete command oneof, operator/error events, and position-history
configuration and clearing. Position snapshots and deltas use the daemon's
one-way binary WebSocket stream so renderer consumers do not require extra
process mediation. A single serialized NML queue orders every command.
Cancelling an RPC only cancels the wait; it cannot undo a command LinuxCNC
already accepted.

`ProgramService` owns opaque workspaces. Upload paths must be relative and
cannot traverse, contain symlinks, or identify executables. Defaults are a
sliding 24-hour TTL, 256 MiB per workspace, and 1 GiB total. The active
workspace is pinned until LinuxCNC closes its program. Before opening a file,
the daemon materializes the workspace into its fixed active-program directory.
At startup it verifies that `[DISPLAY]PROGRAM_PREFIX` resolves to that
directory. Parsing always uses the daemon INI and streams progress, bounded
operation batches, and one final summary.

`HalService` provides topology snapshots and watches, typed batch reads and
writes, mutable HAL value telemetry subscriptions, signal creation,
message-level metadata, writer metadata, and a
bidirectional client-component session. A session owns exactly one component;
closing it destroys the component. Signal link/unlink operations are not part
of v1 because the previous bridge declared but did not implement them.

`ScopeService` permits one exclusive bidirectional controller. A second
controller receives `RESOURCE_EXHAUSTED`. The daemon polls the LinuxCNC scope
shared memory from a non-realtime worker and loads `scope_rt` on first use if
it is not already present. The sample count is configurable and defaults to
32,000. At most one frame is in flight and one coalesced frame is pending;
generation and skipped-frame counters let a client recognize replacement.
Network work never runs from realtime code.

## Endpoint and security

The default gRPC endpoint is `127.0.0.1:50051`. The shared telemetry listener
defaults to `ws://127.0.0.1:50052`, with position history at
`/v1/position-history` and token-attached HAL values at
`/v1/hal-values/{token}`. Addresses
and ports are configurable. The standard gRPC health service is always
available and reflection is disabled unless explicitly enabled. TLS and mutual
TLS are supported for the gRPC control plane. The read-only telemetry
listener is always plaintext WebSocket and does not inherit gRPC TLS settings.
A non-loopback plaintext bind is rejected unless the operator also sets the
explicit unsafe-bind option. The daemon intentionally has no machine lease or
application authorization layer; Noah owns writer policy and concurrency.
HAL Inspector uses `LINUXCNC_TELEMETRY_URL` for the externally reachable
WebSocket base and defaults it to `ws://127.0.0.1:50052`.

## Operational bounds

The initial polling defaults preserve existing timing behavior:

| Work | Default |
| --- | ---: |
| Status | 50 ms |
| Errors | 100 ms |
| Position acquisition | 10 ms |
| HAL topology | 2 s |
| HAL Inspector values | subscription-selected, 50-1000 ms |
| Scope poll | 20 ms |
| Scope heartbeat | 100 ms |

Every subscriber queue is bounded. After synchronization, status watchers
receive sparse typed deltas rather than repeated full snapshots. G-code
operation batches are bounded and scope frames are coalesced for slow clients.

## Current architecture

gRPC is the control plane; position and selected HAL value telemetry flow
directly from the machine daemon to renderers over WebSocket.
