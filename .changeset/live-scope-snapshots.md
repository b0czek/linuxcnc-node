---
"@linuxcnc-node/hal": patch
"@linuxcnc-node/types": patch
---

Expose live, non-consuming snapshots of an in-progress realtime scope capture,
preserve sparse channel mappings, and recover scope ownership after a stale
Inspector backend registration. Add incremental scope deltas for efficient
frontend circular-buffer rendering.
