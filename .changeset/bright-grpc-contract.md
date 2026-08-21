---
"@linuxcnc-node/types": major
"@linuxcnc-node/hal-inspector": major
"@linuxcnc-node/eden-protocol": patch
---

Add the transport-independent v5 LinuxCNC domain contract and the initial
raw `linuxcnc.v1` gRPC client package. Migrate HAL Inspector from copied Node
native addons to the generated HAL and scope clients while preserving its IPC
and UI contracts. Keep the temporary Eden HAL protocol aligned with the exact
64-bit-capable domain value union until the atomic legacy-package removal.
