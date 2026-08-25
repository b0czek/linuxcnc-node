# @linuxcnc-node/grpc-client

Raw generated TypeScript wire messages and grpc-js service clients for
`linuxcnc.v1`.
The package deliberately has no EventEmitter, HAL object model, property
watchers, or transport-layer helper abstractions. Use the raw generated clients directly
and map their wire messages to local domain models at the application boundary.

The checked-in source is generated from `proto/linuxcnc/v1/linuxcnc.proto`.
Run the repository `check:generated` command in CI to verify the schema and
generated enum values remain synchronized.

`createLinuxCncClients` loads the bundled `proto/linuxcnc/v1/linuxcnc.proto`
and health schema beside the installed package by default. Packaged
applications with a custom layout can pass `protoRoot`, `protoPath`, and/or
`healthProtoPath` explicitly; the health path is never inferred from the
application schema filename.

HAL value consumers create and mutate subscriptions with the raw `HalService`
methods, then attach the returned path to the daemon's read-only telemetry
WebSocket. This package exposes the gRPC control contract only; consumers
decode the versioned `LCHV` frames at their renderer boundary.

## Streaming program previews

Use `clients.program.parseProgram(...)` as a readable server stream. Append
every `event.batch.operations` array immediately instead of waiting for the
terminal summary; progress events may be coalesced, while operation batches
are ordered and never dropped. A successful stream ends with exactly one
summary containing authoritative extents and the total operation count.

Call `stream.cancel()` when a preview is superseded or its consumer closes.
The daemon then cancels interpretation and releases the workspace lease. The
high-frequency position-history feed remains a separate WebSocket and should
not be used for program-preview operations.
