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
