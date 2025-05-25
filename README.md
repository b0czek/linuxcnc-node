# Node.js LinuxCNC Bindings

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

_(More modules will be added in the future.)_

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

## Usage (Installing a Package)

To use a specific module, like `@linuxcnc-node/hal`, in your Node.js project:

1.  **Install the package:**

    ```bash
    npm install @linuxcnc-node/hal
    # or
    # yarn add @linuxcnc-node/hal
    ```

    This command will attempt to download and compile the native C++ addon. Ensure your LinuxCNC environment is sourced and build tools are available.

2.  **Import and use in your code:**

    ```javascript
    // For the HAL module
    const hal = require("@linuxcnc-node/hal");
    // or in TypeScript/ESM
    // import * as hal from '@linuxcnc-node/hal';

    // Example: Create a HAL component
    if (hal.componentExists("my-js-comp")) {
      console.log("Component my-js-comp already exists.");
    } else {
      const comp = hal.component("my-js-comp");
      console.log(`Created HAL component: ${comp.name}`);
      // ... use other HAL functions ...
      comp.ready();
    }
    ```

    Refer to the specific module's README (e.g., [`./hal/README.md`](./hal/README.md)) for detailed API documentation and usage examples.

## License

This entire project and its constituent modules are licensed under the **GPL-2.0**. A copy of the GPL-2.0 license can be found at [https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html).
