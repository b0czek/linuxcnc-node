# Native rs274 parser integration

The extracted parser is deliberately independent of Node, N-API, protobuf,
and gRPC. Add these sources to the daemon's native target:

```text
native/server/src/gcode_parser.cc
native/server/src/gcode_canon_preview.cc
native/server/src/gcode_python_modules.cc
native/server/include/linuxcnc_grpc/gcode_parser.hpp
native/server/include/linuxcnc_grpc/gcode_canon_preview.hpp
native/server/include/linuxcnc_grpc/gcode_operation_types.hpp
```

Compile as C++17 with `-DULAPI`. The LinuxCNC include roots required by the
two implementation files are:

```text
<linuxcnc>/include
<linuxcnc>/src
<linuxcnc>/src/emc
<linuxcnc>/src/emc/rs274ngc
<linuxcnc>/src/emc/nml_intf
<linuxcnc>/src/emc/tooldata
<linuxcnc>/src/emc/motion
<linuxcnc>/src/emc/sai
<linuxcnc>/src/libnml/buffer
<linuxcnc>/src/libnml/cms
<linuxcnc>/src/libnml/linklist
<linuxcnc>/src/libnml/nml
<linuxcnc>/src/libnml/os_intf
<linuxcnc>/src/libnml/posemath
<linuxcnc>/src/libnml/rcs
<linuxcnc>/src/rtapi
```

Add the Python development include directory reported by
`python3-config --includes` and link the matching Python runtime. The small
`gcode_python_modules.cc` bridge registers LinuxCNC's `interpreter` and
`emccanon` built-ins for remap support; it does not schedule JavaScript or
perform network work.

Link the LinuxCNC libraries `rs274`, `linuxcncini`, and `tooldata` (plus the
normal transitive Python/plugin and `dl` libraries supplied by the pinned
LinuxCNC build). The parser itself has no transport libraries. The canonical
translation unit must be linked beside the parser because it supplies every
canonical callback required by `rs274ngc`.

`ParseOptions::ini_path` is required and is passed directly to
`InterpBase::ini_load`; callers should use the daemon's configured INI for
every workspace parse. `batch_size` bounds each `OperationBatch` delivered to
`on_batch`. Returning `false` from that callback or returning `true` from
`is_cancelled` stops the parser at the next read/execute boundary. A callback
never performs network I/O from canonical/realtime code: it runs on the parser
worker thread after the interpreter step.

The optional `gcode_parser_smoke` test checks complete batching, extents, and
cancellation. Use `tests/run_gcode_parser_smoke.sh <binary>`; the runner owns
its native fixtures and copies the INI parameter/tool files into a temporary
working directory so parser state cannot create files in the repository.
