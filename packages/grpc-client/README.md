# @linuxcnc-node/grpc-client

Raw generated TypeScript wire messages and grpc-js service clients for
`linuxcnc.v1`.
The package deliberately has no EventEmitter, HAL object model, property
watchers, or transport-layer helper abstractions. Use the raw generated clients directly
and map their wire messages to local domain models at the application boundary.

The checked-in source is generated from the schema set in `proto/linuxcnc/v1`;
`linuxcnc.proto` is the aggregate entrypoint.
Run the repository `check:generated` command in CI to verify the schema and
generated enum values remain synchronized.

`createLinuxCncClients` loads the bundled `proto/linuxcnc/v1/linuxcnc.proto`
and health schema beside the installed package by default. Packaged
applications with a custom layout can pass `protoRoot`, `protoPath`, and/or
`healthProtoPath` explicitly; the health path is never inferred from the
application schema filename.

The returned `ini` client provides read-only access to the server session's
active LinuxCNC INI. Its requests select a section, key, and optional one-based
occurrence; no operation accepts an INI filename.

HAL value consumers create and mutate subscriptions with the raw `HalService`
methods, then attach the returned path to the daemon's read-only telemetry
WebSocket. This package exposes the gRPC control contract only; renderers use
`@linuxcnc-node/websocket-client` for protobuf frame decoding.

Program workspaces remain on `ProgramService`; previews are delivered only by
the protobuf WebSocket data plane and are not part of this package's gRPC API.
