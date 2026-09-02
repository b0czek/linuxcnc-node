# @linuxcnc-node/types

Transport-independent TypeScript domain types for LinuxCNC applications.

Version 5 keeps the machine, G-code, position, HAL, scope, tool, and command
domain models transport-independent. It has no protobuf or gRPC dependency.
`LinuxCncCommand` is an object-shaped discriminated union generated from the
protobuf command oneof. Command policies inspect its named properties rather
than native positional tuples.

The old `StatChange`, watcher callback, `ParseOptions`, and `ParseProgress`
names remain only as deprecated source-compatibility types for downstream
cleanup. They are not part of the v5 wire contract.

`src/generated/enums.ts`, `domain.ts`, and `commands.ts` are emitted from the
versioned schema set in `proto/linuxcnc/v1`; `linuxcnc.proto` is its aggregate
entrypoint. The generated artifacts record the complete command union, stable
field names/numbers, G-code operation variants, exact HAL scalar variants,
scope channel slot fields, and Float64Array position layouts.
`pnpm run check:generated` regenerates the files in a temporary directory and
byte-compares them before checking the TypeScript domain surface, so schema or
domain-field drift fails before publication.

## Installation

```bash
pnpm add @linuxcnc-node/types
```

## License

MIT
