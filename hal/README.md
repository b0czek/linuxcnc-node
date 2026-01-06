# HAL Module for Node.js (@linuxcnc-node/hal)

This module provides Node.js bindings for the LinuxCNC Hardware Abstraction Layer (HAL). It allows you to create and interact with HAL components, pins, parameters, and signals directly from JavaScript or TypeScript.

## Features

- Create HAL components`.
- Get and set values of pins and parameters.
- **Monitoring**: Watch pin and parameter value changes with configurable polling intervals and callback functions.
- Global HAL functions:
  - Check if components exist or are ready.
  - Manage RTAPI message levels.
  - Create new signals.
  - Connect pins to signals and disconnect them.
  - Get and set values of arbitrary pins, parameters, or signals.
  - Retrieve information about all pins, signals, or parameters in the system.

## Installation

To install the `@linuxcnc-node/hal` module, use npm or yarn:

```bash
npm install @linuxcnc-node/hal
# or
yarn add @linuxcnc-node/hal
```

### LinuxCNC Build Requirements

The module needs to compile against the LinuxCNC development headers and link against its libraries.

#### Standard LinuxCNC Installations

For standard LinuxCNC installations (e.g., from a Debian package or `run-in-place` after `./configure && make`):

- The build script will attempt to locate the necessary files automatically.

#### Custom LinuxCNC Installations

For non-standard or custom LinuxCNC installations:

If LinuxCNC is installed in a custom location you will need to set the following environment variables before running `npm install` or `yarn add`:

- `LINUXCNC_INCLUDE`: Path to the directory containing LinuxCNC's include files (e.g., `hal.h`, `rtapi.h`).
  Example: `export LINUXCNC_INCLUDE=/path/to/linuxcnc-dev/include`
- `LINUXCNC_LIB`: Path to the directory containing LinuxCNC's compiled libraries (e.g., `liblinuxcnchal.so`).
  Example: `export LINUXCNC_LIB=/path/to/linuxcnc-dev/lib`

## Usage Example

```typescript
import { HalComponent } from "@linuxcnc-node/hal";
import * as hal from "@linuxcnc-node/hal";

// --- Component Creation ---
const comp = new HalComponent("my-js-comp");

console.log(`Component Name: ${comp.name}`);
console.log(`Component Prefix: ${comp.prefix}`);

// --- Adding Pins and Parameters ---
const outFloatPin = comp.newPin("output.float", "float", "out");
const inBitPin = comp.newPin("input.bit", "bit", "in");
const rwS32Param = comp.newParam("param.s32", "s32", "rw");

// --- Making Component Ready ---
comp.ready();
console.log(`Is 'my-js-comp' ready? ${HalComponent.isReady("my-js-comp")}`);

// --- Accessing Pin/Param Values ---
outFloatPin.setValue(123.45);
rwS32Param.setValue(-100);

console.log(`Value of output.float: ${outFloatPin.getValue()}`);
console.log(`Value of input.bit (not connected): ${inBitPin.getValue()}`);

// Or via component methods
comp.setValue("output.float", 456.78);
console.log(`Value via component: ${comp.getValue("output.float")}`);

// --- Global HAL Functions ---
hal.newSignal("my-js-signal", "bit");
hal.connect("my-js-comp.output.float", "another-signal-float");
hal.setSignalValue("my-js-signal", true);
console.log(`Value of 'my-js-signal': ${hal.getValue("my-js-signal")}`);

// --- Information Functions ---
console.log("All Pins:", JSON.stringify(hal.getInfoPins(), null, 2));

// --- Message Levels ---
hal.setMsgLevel("all");
console.log(`Current message level: ${hal.getMsgLevel()}`);

// --- Monitoring System ---
// Set up monitoring with custom polling interval
comp.setMonitoringOptions({ pollInterval: 20 }); // Check every 20ms

// Watch for changes on pins and parameters
outFloatPin.on("change", (newValue, oldValue) => {
  console.log(`Output pin changed: ${oldValue} -> ${newValue}`);
});

rwS32Param.on("change", (newValue, oldValue) => {
  console.log(`Parameter changed: ${oldValue} -> ${newValue}`);
});

// Remove specific callbacks when no longer needed
const myCallback = (val) => console.log(val);
outFloatPin.on("change", myCallback);
outFloatPin.off("change", myCallback);

// Clean up monitoring when done
comp.dispose(); // Stops all monitoring and cleans up resources
```

## Example Application

For a comprehensive example of how to use this module in a real-world application, see the **HAL View** example:

- **[HAL View Example](../examples/halview/README.md)**: A modern Electron-based HAL viewer application that demonstrates advanced usage of the `@linuxcnc-node/hal` module.

## Quick Reference

### Main Entry Point

- `new HalComponent(name, prefix?)` - Creates a new HAL component

### HalComponent Methods

- `newPin()`, `newParam()` - Create pins and parameters
- `ready()`, `unready()` - Control component state
- `getValue()`, `setValue()` - Get/set values by name
- `getPins()`, `getParams()` - Retrieve created items
- `getPin()`, `getParam()` - Get specific pin/param by name
- `setMonitoringOptions()` - Configure monitoring
- `dispose()` - Clean up resources

### Static Methods

- `HalComponent.exists(name)` - Check if component exists
- `HalComponent.isReady(name)` - Check if component is ready

### Pin/Param Methods

- `getValue()`, `setValue()` - Get/set values
- `on("change", cb)`, `off("change", cb)` - Monitor value changes

### Global Functions

- `getMsgLevel()`, `setMsgLevel()` - Message level control
- `connect()`, `disconnect()` - Pin/signal connections
- `newSignal()` - Create signals
- `getValue()`, `setPinParamValue()`, `setSignalValue()` - Value operations
- `getInfoPins()`, `getInfoSignals()`, `getInfoParams()` - Information queries
- `pinHasWriter()` - Check pin writer status

### Current Limitations

- **64-bit Integers (`s64`, `u64`):**
  JavaScript's native `number` type is an IEEE 754 double-precision float. The C++ bindings convert 64-bit HAL integers to `double` for JavaScript. This means that integers larger than `Number.MAX_SAFE_INTEGER` (2<sup>53</sup>-1) or smaller than `Number.MIN_SAFE_INTEGER` will lose precision. Full `BigInt` support for 64-bit types is not implemented.
- **No `HAL_PORT` Support:**
  Binding, creation, and interaction with `HAL_PORT` type pins or signals are not currently implemented.

### Implementation Detail: `hal_priv.h`

To provide comprehensive bindings that closely match the functionality available in the C API (and subsequently the Python bindings), this library includes `hal_priv.h` from the LinuxCNC source repository. This header allows access to internal HAL data structures and functions (like `halpr_find_comp_by_name`, `hal_data->pin_list_ptr`, etc.). This approach aims for functional parity with `halcmd` and Python's `hal` library where possible.
