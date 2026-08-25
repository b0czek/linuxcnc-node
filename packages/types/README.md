# @linuxcnc-node/types

Transport-independent TypeScript domain types for LinuxCNC applications.

Version 5 keeps the machine, G-code, position, HAL, scope, tool, and command
domain models transport-independent. It has no protobuf or gRPC dependency.
Use `@linuxcnc-node/grpc-client` for the raw
`linuxcnc.v1` wire contract and perform conversion at the application boundary.

The old `StatChange`, watcher callback, `ParseOptions`, and `ParseProgress`
names remain only as deprecated source-compatibility types for downstream
cleanup. They are not part of the v5 wire contract.

`src/generated/enums.ts` and `src/generated/domain.ts` are emitted from the
versioned schema set in `proto/linuxcnc/v1`; `linuxcnc.proto` is its aggregate
entrypoint. The generated domain artifact
records stable field names/numbers, G-code operation variants, exact HAL scalar
variants, scope channel slot fields, and Float64Array position layouts.
`pnpm run check:generated` regenerates both files in a temporary directory and
byte-compares them before checking the TypeScript domain surface, so schema or
domain-field drift fails before publication.

## Installation

```bash
pnpm add @linuxcnc-node/types
```

## License

MIT
