# LinuxCNC Node

LinuxCNC Node is an open-source JavaScript and TypeScript monorepo for building
applications on top of LinuxCNC. It includes native Node.js bindings, shared
TypeScript types, G-code tooling, Eden AppBus integration, example applications,
and the LinuxCNC patch set used by the maintained packages.

> **Compatibility:** Starting with v3, these packages are purpose-built for
> **LinuxCNC 2.10** at the pinned
> [base revision](./linuxcnc-patches/base-revision) with this repository's
> [LinuxCNC patch series](./linuxcnc-patches/README.md) applied. Stock or
> other LinuxCNC builds are not ABI-compatible with these packages.

## Repository Layout

- **`packages/core`**: NML access for status monitoring, machine commands,
  error/operator messages, and high-frequency position logging.
  [README](./packages/core/README.md)
- **`packages/hal`**: Bindings for the LinuxCNC Hardware Abstraction Layer
  (HAL), including components, pins, params, signals, and global HAL access.
  [README](./packages/hal/README.md)
- **`packages/gcode`**: G-code parsing through LinuxCNC's rs274ngc
  interpreter for toolpath visualization and program inspection.
  [README](./packages/gcode/README.md)
- **`packages/types`**: Shared TypeScript definitions used by the runtime
  packages. [README](./packages/types/README.md)
- **`packages/eden-protocol`**: Eden AppBus protocol declarations for
  LinuxCNC Node services.
- **`apps/eden/bridge`**: Eden backend app that exposes the
  LinuxCNC Node packages as IPC services.
- **`apps/examples`**: Example applications using the packages in this
  workspace.
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

## Examples

- **`apps/examples/halview`**: Electron HAL viewer built with
  `@linuxcnc-node/hal`. [README](./apps/examples/halview/README.md)
- **`apps/examples/gcode-viewer`**: 3D G-code visualizer built with
  `@linuxcnc-node/gcode`. [README](./apps/examples/gcode-viewer/README.md)

## Prerequisites

1. **LinuxCNC Environment**
   - A working LinuxCNC development environment.
   - Source the LinuxCNC runtime environment before running applications that
     use the native packages.
   - LinuxCNC headers and libraries must be available when building native
     addons.
2. **Node.js and pnpm**
3. **Native build tools**
   - C++ compiler, Python, `make`, and the usual `node-gyp` prerequisites.

## License

Most runtime packages and apps are licensed under **GPL-2.0-only**. The
`@linuxcnc-node/types` and `@linuxcnc-node/eden-protocol` packages are licensed
under **MIT**.
