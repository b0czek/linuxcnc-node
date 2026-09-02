# @linuxcnc-node/websocket-client

Browser-safe ESM client for the read-only `linuxcnc.v1` protobuf WebSocket data plane.

Use `openPositionHistory`, `openHalValues`, or `openProgramPreview`. Each binary
WebSocket message contains exactly one protobuf frame. Connections never reconnect
automatically; callers can close the returned handle or pass an `AbortSignal`.
