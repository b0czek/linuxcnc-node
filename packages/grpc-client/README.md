# @linuxcnc-node/grpc-client

Raw generated TypeScript wire messages and grpc-js service clients for
`linuxcnc.v1`.
The package deliberately has no EventEmitter, HAL object model, property
watchers, or native addon dependency. Use the raw generated clients directly
and map their wire messages to local domain models at the application boundary.

The checked-in source is generated from `proto/linuxcnc/v1/linuxcnc.proto`.
Run the repository `check:generated` command in CI to verify the schema and
generated enum values remain synchronized.

`createLinuxCncClients` loads the bundled `proto/linuxcnc/v1/linuxcnc.proto`
and health schema beside the installed package by default. Packaged
applications with a custom layout can pass `protoRoot`, `protoPath`, and/or
`healthProtoPath` explicitly; the health path is never inferred from the
application schema filename.
