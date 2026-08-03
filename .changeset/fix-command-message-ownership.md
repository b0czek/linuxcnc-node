---
"@linuxcnc-node/core": patch
---

Release concrete NML command messages after their synchronous write and track
asynchronous completion by serial number, preventing invalid deallocation in
commands such as `teleopEnable(false)`.
