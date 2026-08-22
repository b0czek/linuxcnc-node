---
"@linuxcnc-node/types": major
"@linuxcnc-node/hal-inspector": major
"@linuxcnc-node/grpc-client": major
"@linuxcnc-node/eden-protocol": major
"@linuxcnc-node/eden-bridge": major
---

Add the transport-independent v5 LinuxCNC domain contract and the initial
raw `linuxcnc.v1` gRPC client package. Migrate HAL Inspector from copied Node
native addons to the generated HAL and scope clients while preserving its IPC
and UI contracts. Keep position-history configuration and clearing on gRPC,
move renderer telemetry to the daemon's versioned binary WebSocket stream, and
remove the legacy position-logger AppBus/FFI service. Keep the temporary Eden
HAL protocol aligned with the exact 64-bit-capable domain value union until the
atomic legacy-package removal.
