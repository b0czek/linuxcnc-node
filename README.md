# Node.js LinuxCNC Bindings

> **Note:** All packages in this project are written for **LinuxCNC 2.10**.

This project provides Node.js bindings for various C++ functionalities within the LinuxCNC. The primary goal is to offer an API close to the existing Python one, making it familiar for those who have worked with LinuxCNC in Python.

## Project Vision

The aim is to create a comprehensive suite of Node.js libraries that allow developers to interact with and extend LinuxCNC using JavaScript and TypeScript. This can be useful for:

- Building custom user interfaces or dashboards.
- Integrating LinuxCNC with other Node.js-based systems.
- Developing real-time control applications or components in JavaScript.
- Prototyping and scripting HAL configurations.

## Modules

The project is organized into modules, each corresponding to a specific area of LinuxCNC:

- **`/hal`**: Bindings for the LinuxCNC Hardware Abstraction Layer (HAL).

  - Provides functionality to create HAL components, pins, parameters, signals, and interact with the HAL environment.
  - **[View HAL Module README](./hal/README.md)**

- **`/hal-2.8`**: Backported version of **`/hal`** module to work with LinuxCNC 2.8 with reduced set of functionalities.

  - Provides basic HAL component creation and manipulation features, but may lack some global HAL functionalities present in the main module.
  - Created to build a simple VCP (Virtual Control Panel) interface without using Python.
  - **[View HAL 2.8 Module README](./hal-2.8/README.md)**

- **`/core`**: Bindings for the LinuxCNC NML interface.

  - Provides StatChannel for real-time status monitoring, CommandChannel for machine control, ErrorChannel for error/operator messages, and PositionLogger for high-frequency position logging.
  - **[View Core Module README](./core/README.md)**

- **`/gcode`**: G-code file parser using LinuxCNC's rs274ngc interpreter.
  - Parses G-code files and extracts sequential operations (traverse, feed, arc, etc.) for toolpath visualization.
  - Features high-performance parsing with progress reporting and machine state tracking.
  - **[View G-code Module README](./gcode/README.md)**

## Examples

The project includes practical examples demonstrating how to use the modules:

- **`/examples/halview`**: A modern Electron-based HAL viewer application built using the `@linuxcnc-node/hal` module.

  - Replicates core functionality of the classic `halshow` program with modern UI enhancements.
  - Features include HAL item browsing, real-time watch lists, component-focused views, and preset management.
  - Built with Electron, React, TypeScript, and Ant Design.
  - **[View HAL View Example README](./examples/halview/README.md)**

- **`/examples/gcode-viewer`**: A 3D G-code visualizer built using `@linuxcnc-node/gcode`.
  - Features real-time toolpath rendering, playback simulation, and G-code line tracking.
  - **[View G-code Viewer Example README](./examples/gcode-viewer/README.md)**

## Prerequisites

To build and use these bindings, your system will generally need:

1.  **LinuxCNC Environment:**
    - A working installation of LinuxCNC.
    - The LinuxCNC environment must be sourced (e.g., by running `source /path/to/linuxcnc-dev/scripts/rip-environment` or similar for your setup) _before running Node.js applications that use these bindings_. This ensures that the LinuxCNC shared libraries (like `liblinuxcnchal.so`) are findable by the Node.js addon.
    - **LinuxCNC Development Files:** You will need the LinuxCNC header files for building the addons from source. These are typically available when you have a LinuxCNC development setup (e.g., built from source, or `linuxcnc-uspace-dev` package installed).
2.  **Node.js:**
    - Node.js and npm (or yarn).
3.  **Build Tools:**
    - The native C++ addons are compiled using `node-gyp`. This requires:
      - A C++ compiler (e.g., g++).
      - Python (v3.x, for `node-gyp`).
      - `make`.
    - These are often installed via a package like `build-essential` on Debian/Ubuntu systems.

## License

This project and its constituent modules are primarily licensed under the **GPL-2.0**. A copy of the GPL-2.0 license can be found at [https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html).

The `@linuxcnc-node/types` package is licensed under the **MIT** license.
