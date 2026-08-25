---
"@linuxcnc-node/types": major
"@linuxcnc-node/hal-inspector": major
"@linuxcnc-node/grpc-client": major
---

Add the transport-independent v5 LinuxCNC domain contract and the initial
raw `linuxcnc.v1` gRPC client package. Migrate HAL Inspector from copied
bindings to the generated HAL and scope clients while preserving its UI
contracts. Keep position-history configuration and clearing on gRPC, move
renderer telemetry to the daemon's versioned binary WebSocket stream, and keep
the domain value union aligned with exact 64-bit transport semantics.
