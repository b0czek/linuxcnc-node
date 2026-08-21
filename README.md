# LinuxCNC Node

LinuxCNC Node is an open-source C++ and TypeScript monorepo for building
applications on top of LinuxCNC. Its native architecture is one standalone
`linuxcnc-grpc-server` beside one patched LinuxCNC instance, a versioned raw
gRPC client, and transport-independent TypeScript domain types. The repository
also contains the LinuxCNC patch set used by the maintained packages.

The gRPC cutover is being developed behind an atomic parity gate. The previous
Node native addons and Eden bridge remain in the tree only until HAL Inspector
and the external Seraph consumers pass end-to-end against gRPC; they are not a
second supported long-term runtime. See the [native gRPC architecture and
cutover contract](./docs/grpc-cutover.md).

> **Compatibility:** Starting with v3, these packages are purpose-built for
> **LinuxCNC 2.10** at the pinned
> [base revision](./linuxcnc-patches/base-revision) with this repository's
> [LinuxCNC patch series](./linuxcnc-patches/README.md) applied. Stock or
> other LinuxCNC builds are not ABI-compatible with these packages.

## Repository Layout

- **`proto/linuxcnc/v1`**: Versioned protobuf wire contract for machine,
  program, HAL, and scope services.
- **`native/server`**: C++17 domain library and `linuxcnc-grpc-server` daemon.
- **`packages/grpc-client`**: Raw generated Node gRPC clients and protobuf
  message types, without convenience wrappers. [README](./packages/grpc-client/README.md)
- **`packages/core`**: NML access for status monitoring, machine commands,
  error/operator messages, and high-frequency position logging (legacy during
  parity development).
  [README](./packages/core/README.md)
- **`packages/hal`**: Bindings for the LinuxCNC Hardware Abstraction Layer
  (HAL), including components, pins, params, signals, and global HAL access.
  [README](./packages/hal/README.md)
- **`packages/gcode`**: G-code parsing through LinuxCNC's rs274ngc
  interpreter for toolpath visualization and program inspection.
  [README](./packages/gcode/README.md)
- **`packages/types`**: Transport-independent constants and domain models used
  by consumers. [README](./packages/types/README.md)
- **`packages/eden-protocol`**: Eden AppBus protocol declarations for
  LinuxCNC Node services.
- **`apps/eden/bridge`**: Eden backend app that exposes the
  LinuxCNC Node packages as IPC services.
- **`linuxcnc-patches`**: Maintained LinuxCNC patch series and pinned upstream
  baseline.

## Development

Install dependencies from the repository root:

```sh
pnpm install
```

Build all publishable packages:

```sh
pnpm run build:packages
```

Run the TypeScript checks:

```sh
pnpm run typecheck
```

Build and test the standalone native contract without a running LinuxCNC
instance:

```sh
cmake -S . -B build/native-grpc \
  -DLINUXCNC_GRPC_BUILD_WIRE=ON \
  -DCMAKE_BUILD_TYPE=Debug
cmake --build build/native-grpc --parallel
ctest --test-dir build/native-grpc --output-on-failure
```

Run tests with the LinuxCNC runtime environment sourced and the required
`LINUXCNC_INCLUDE` and `LINUXCNC_LIB` variables set:

```sh
pnpm test
```

## Patched LinuxCNC Baseline

The maintained patches, their order, and the reason each divergence exists are
documented in [`linuxcnc-patches`](./linuxcnc-patches/README.md). Build
LinuxCNC from the pinned revision with that complete series before building or
running the native packages. CI performs the same checkout, patch, and build
flow.

## Prerequisites

1. **LinuxCNC Environment**
   - A working LinuxCNC development environment.
   - Source the LinuxCNC runtime environment before running applications that
     use the native packages.
   - LinuxCNC headers and libraries must be available when building native
     addons.
2. **Node.js 24.15 or later and pnpm**
3. **Native build tools**
   - A C++17 compiler, CMake, Python development headers, protobuf, and gRPC.
   - On Debian-family systems the contract build uses `libgrpc++-dev`,
     `libgrpc-dev`, `libprotobuf-dev`, `protobuf-compiler`, and
     `protobuf-compiler-grpc`.
   - The legacy parity packages still require `make` and `node-gyp` until the
     atomic removal gate is met.

## License

Most runtime packages and apps are licensed under **GPL-2.0-only**. The
`@linuxcnc-node/types`, `@linuxcnc-node/grpc-client`, and
`@linuxcnc-node/eden-protocol` packages are licensed under **MIT**.
