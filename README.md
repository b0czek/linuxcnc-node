# LinuxCNC Node

LinuxCNC Node is an open-source C++ and TypeScript monorepo for building
applications on top of LinuxCNC. Its architecture is one standalone
`linuxcnc-grpc-server` beside one patched LinuxCNC instance, a versioned raw
gRPC client, transport-independent TypeScript domain types, and a direct binary
WebSocket stream for high-frequency position telemetry. The legacy Node native
addons and Eden bridge were retired after the atomic gRPC cutover. See the
[native architecture](./docs/grpc-cutover.md).

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
- **`packages/types`**: Transport-independent constants and domain models used
  by consumers. [README](./packages/types/README.md)
- **`apps/eden/hal-inspector`**: Eden HAL and scope inspector using the raw
  gRPC client.
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

Run the TypeScript contract and consumer tests:

```sh
pnpm test
```

## Patched LinuxCNC Baseline

The maintained patches, their order, and the reason each divergence exists are
documented in [`linuxcnc-patches`](./linuxcnc-patches/README.md). Build
LinuxCNC from the pinned revision with that complete series before building or
running the native daemon. CI performs the same checkout, patch, and build
flow.

## Prerequisites

1. **LinuxCNC Environment**
   - A working LinuxCNC development environment.
   - Source the LinuxCNC runtime environment before running the native daemon.
   - LinuxCNC headers and libraries must be available when building it.
2. **Node.js 24.15 or later and pnpm**
3. **Native build tools**
   - A C++17 compiler, CMake, Python development headers, protobuf, and gRPC.
   - On Debian-family systems the contract build uses `libgrpc++-dev`,
     `libgrpc-dev`, `libprotobuf-dev`, `protobuf-compiler`, and
     `protobuf-compiler-grpc`.

## License

The native runtime and apps are licensed under **GPL-2.0-only**.
`@linuxcnc-node/types` and `@linuxcnc-node/grpc-client` are licensed under
**MIT**.
