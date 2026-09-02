---
"@linuxcnc-node/hal-inspector": patch
---

Keep asynchronous HAL value reads matched to the subscription snapshot that requested them and prevent overlapping polls.
