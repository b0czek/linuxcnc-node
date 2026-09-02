# @linuxcnc-node/hal-inspector

## 5.0.0

### Major Changes

- ecdd07a: Add the transport-independent v5 LinuxCNC domain contract and the initial
  raw `linuxcnc.v1` gRPC client package. Migrate HAL Inspector from copied
  bindings to the generated HAL and scope clients while preserving its UI
  contracts. Keep position-history configuration and clearing on gRPC, move
  renderer telemetry to the daemon's versioned binary WebSocket stream, and keep
  the domain value union aligned with exact 64-bit transport semantics.

### Patch Changes

- 62083e8: Retry HAL daemon initialization with bounded backoff and restore connection state after successful RPCs.
- 854b636: Replace boolean text editing with a bezel-mounted state LED and direct icon-labelled Set, Clear, and Toggle controls.
- e5373a1: Wait for scope command acknowledgements, recover topology watches after
  transient failures, handle failed scope streams without unhandled rejections,
  decode default-valued scope channel metadata, and preserve the spindle
  at-speed default when the option is omitted.
- 310a085: Keep asynchronous HAL value reads matched to the subscription snapshot that requested them and prevent overlapping polls.
- 854b636: Keep virtualized HAL lists stable when switching between inspector tabs.
- 787fb68: Update edited HAL values immediately from the successful write response.
- c2d4a27: Accept scope capture messages up to the daemon's supported gRPC receive limit.
- Updated dependencies [ecdd07a]
- Updated dependencies [e5373a1]
- Updated dependencies [f243489]
- Updated dependencies [8e4aa21]
- Updated dependencies [633c019]
- Updated dependencies [4545481]
- Updated dependencies [9ae2afa]
  - @linuxcnc-node/types@5.0.0
  - @linuxcnc-node/grpc-client@5.0.0
  - @linuxcnc-node/websocket-client@5.0.0

## 4.0.0

### Patch Changes

- 1f79052: Bind HAL Inspector releases to the shared LinuxCNC Node version.
- Updated dependencies [f6f47c7]
- Updated dependencies [bfedf93]
- Updated dependencies [0f1065a]
- Updated dependencies [38b92e5]
- Updated dependencies [9d80fbe]
  - @linuxcnc-node/types@4.0.0
  - @linuxcnc-node/hal@4.0.0
