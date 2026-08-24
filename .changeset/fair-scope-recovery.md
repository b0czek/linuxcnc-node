---
"@linuxcnc-node/hal-inspector": patch
"@linuxcnc-node/grpc-client": patch
---

Wait for scope command acknowledgements, recover topology watches after
transient failures, handle failed scope streams without unhandled rejections,
decode default-valued scope channel metadata, and preserve the spindle
at-speed default when the option is omitted.
