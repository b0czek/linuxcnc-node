# @linuxcnc-node/grpc-client

## 5.0.0

### Major Changes

- ecdd07a: Add the transport-independent v5 LinuxCNC domain contract and the initial
  raw `linuxcnc.v1` gRPC client package. Migrate HAL Inspector from copied
  bindings to the generated HAL and scope clients while preserving its UI
  contracts. Keep position-history configuration and clearing on gRPC, move
  renderer telemetry to the daemon's versioned binary WebSocket stream, and keep
  the domain value union aligned with exact 64-bit transport semantics.
- f243489: Clarify machine error sequences, support replaying retained errors, and expose
  wrapped LinuxCNC command serials as unsigned 32-bit values.

### Patch Changes

- e5373a1: Wait for scope command acknowledgements, recover topology watches after
  transient failures, handle failed scope streams without unhandled rejections,
  decode default-valued scope channel metadata, and preserve the spindle
  at-speed default when the option is omitted.
- 8e4aa21: Expose nine-axis tool wear offsets in status and preserve omitted tool-table
  fields and coordinate tails during partial `setTool` updates. Route tool
  upsert, relocation, and deletion through LinuxCNC-owned transactional NML
  commands with validation, durable persistence, and normal command completion.
  Remote CRUD supports file-backed random and nonrandom tool tables;
  the pinned LinuxCNC build rejects `DB_PROGRAM` during IO initialization.
- 633c019: Preserve presence for position-history `enabled` updates so partial configuration requests do not disable and clear history.
- 4545481: Expose ordered cutter-compensation OFF/LEFT/RIGHT events in G-code preview
  streams so clients can distinguish compensated path segments.
- 9ae2afa: Document incremental consumption and cancellation semantics for the existing
  server-streaming G-code preview RPC. Preserve the preview interpreter's
  nonzero default feed and the orthogonal position axis across non-XY NURBS
  moves.
- Updated dependencies [ecdd07a]
- Updated dependencies [f243489]
- Updated dependencies [8e4aa21]
- Updated dependencies [4545481]
  - @linuxcnc-node/types@5.0.0
