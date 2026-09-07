---
"@linuxcnc-node/types": patch
"@linuxcnc-node/grpc-client": patch
---

Rename the overloaded `stop` machine command to `stopProgram` so recoverable
AUTO program stopping remains distinct from task abort.
