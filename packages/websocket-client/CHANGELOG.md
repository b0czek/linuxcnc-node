# @linuxcnc-node/websocket-client

## 5.0.0

### Minor Changes

- f243489: Clarify machine error sequences, support replaying retained errors, and expose
  wrapped LinuxCNC command serials as unsigned 32-bit values.

### Patch Changes

- 4545481: Expose ordered cutter-compensation OFF/LEFT/RIGHT events in G-code preview
  streams so clients can distinguish compensated path segments.
- Updated dependencies [ecdd07a]
- Updated dependencies [f243489]
- Updated dependencies [8e4aa21]
- Updated dependencies [4545481]
  - @linuxcnc-node/types@5.0.0
