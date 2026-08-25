# Native LinuxCNC gRPC server foundation

`linuxcnc-grpc-domain` contains transport-neutral C++17 building blocks for
the standalone daemon: serialized command coordination, typed status replay,
bounded position history, exact-width HAL values, secure program workspaces,
and exclusive/coalesced scope frames. These classes do not include Node,
N-API, protobuf, or gRPC headers.

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

## Telemetry WebSocket

Position-history configuration and clearing remain on `MachineService` through
`ConfigurePositionHistory` and `ClearPositionHistory`. Telemetry is published
directly to renderers at `ws://127.0.0.1:50052/v1/position-history` by default;
set `--telemetry-endpoint=HOST:PORT` to change the shared listener. This
read-only telemetry listener is always a plaintext `ws://` endpoint; `--tls`
and `--mtls` secure only the gRPC control plane. A non-loopback telemetry bind
requires `--unsafe-non-loopback`.

The application protocol is server-to-client only. Client data messages close
the connection with WebSocket policy error 1008. Each connection begins with a
replacement frame, followed by deltas. A clear, reconfiguration, generation
change, or retention rollover produces another replacement.

Every message is one binary frame. Multi-byte fields and payload doubles are
little-endian:

| Offset | Size | Value |
| ---: | ---: | --- |
| 0 | 4 | ASCII `LCPH` |
| 4 | 1 | version, currently `2` |
| 5 | 1 | kind: `1` replacement, `2` delta |
| 6 | 2 | point stride, currently `10` |
| 8 | 8 | generation (`uint64`) |
| 16 | 8 | first sequence (`uint64`) |
| 24 | 8 | next sequence (`uint64`) |
| 32 | 4 | payload value count (`uint32`) |
| 36 | 4 | tail points to remove before applying a delta (`uint32`) |
| 40 | `value_count * 8` | packed Float64 position values |

In a browser, set `socket.binaryType = "arraybuffer"`, validate the magic,
version, stride, and exact frame length with `DataView`, then create a
`Float64Array(buffer, 40, valueCount)` on little-endian hosts. Kind 1 replaces
the preview's accumulated history and always has a zero replacement count.
For kind 2, remove `replace_count` points from the accumulated tail before
appending the payload. Sequence and generation are 64-bit values and should
be read with `DataView.getBigUint64(..., true)`.

HAL value telemetry uses the same listener. Create and update a subscription
with `HalService.CreateValueSubscription` and `UpdateValueSubscription`, then
attach the returned single-use path at `/v1/hal-values/{token}`. Configuration
changes preserve the socket and advance its revision; the first frame for each
revision is a complete replacement. `DeleteValueSubscription` and WebSocket
disconnects release the subscription.

HAL frames have a 32-byte header containing ASCII `LCHV`, version `1`, frame
kind, 16-byte entry stride, configuration revision, sequence, and entry count.
Each entry contains a `uint32` slot, a `HalType` byte, and an eight-byte typed
payload. Type zero means unavailable. Multi-byte fields are little-endian;
`s64` and `u64` must be decoded as integers rather than JavaScript numbers.
Slow consumers receive coalesced latest-state deltas rather than every sampled
transition. Client WebSocket messages are forbidden on both telemetry routes.

The HAL service uses the pinned LinuxCNC HAL repository for topology, exact
scalar reads/writes, signals, and session-owned components. The scope service
loads `scope_rt` on first use when needed, attaches its sampling function to
the configured thread, and keeps shared-memory polling off the realtime path.
Workspace paths are validated and materialized on the serialized NML command
worker into the configured active program directory, with active-workspace
pinning reconciled against LinuxCNC status.

With wire generation disabled, the same executable is a configuration-check
harness. It validates endpoint/TLS policy and `[DISPLAY] PROGRAM_PREFIX` when
invoked with `--ini`, then returns status 78 rather than pretending to listen.

To generate build-tree protobuf/gRPC C++ sources once the standard imports and
development tools are available, configure with
`-DLINUXCNC_GRPC_BUILD_WIRE=ON`. Wire generation is the default; pass
`-DLINUXCNC_GRPC_BUILD_WIRE=OFF` for an explicit domain-only build.

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

## Program preview gRPC stream

`ProgramService.ParseProgram` is the only public program-preview stream. It is
a finite, server-streaming RPC; program previews are not published through the
position-history WebSocket. A successful stream contains zero or more
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
the RPC stops interpretation at the next interpreter-step boundary, releases
the workspace lease, and does not emit a success summary.
