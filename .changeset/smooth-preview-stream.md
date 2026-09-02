---
"@linuxcnc-node/grpc-client": patch
---

Document incremental consumption and cancellation semantics for the existing
server-streaming G-code preview RPC. Preserve the preview interpreter's
nonzero default feed and the orthogonal position axis across non-XY NURBS
moves.
