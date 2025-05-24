# HAL Module for Node.js (@linuxcnc-node/hal)

This module provides Node.js bindings for the LinuxCNC Hardware Abstraction Layer (HAL). It allows you to create and interact with HAL components, pins, parameters, and signals directly from JavaScript or TypeScript.

The API is designed to be familiar to users of the Python `hal` module.

## Features

- Create HAL components.
- Define HAL pins and parameters for components.
- Set components to ready/unready state.
- Get and set values of pins and parameters using a proxy-like interface.
- Global HAL functions:
  - Check if components exist or are ready.
  - Manage RTAPI message levels.
  - Create new signals.
  - Connect pins to signals and disconnect them.
  - Get and set values of arbitrary pins, parameters, or signals.
  - Retrieve information about all pins, signals, or parameters in the system.
- TypeScript support with type definitions and wrapper classes.

## Usage Example

```javascript
const hal = require("@linuxcnc-node/hal");

// --- Component Creation ---
// Create a new HAL component named 'my-js-comp'
const comp = hal.component("my-js-comp");

console.log(`Component Name: ${comp.name}`);
console.log(`Component Prefix: ${comp.prefix}`);

// --- Adding Pins and Parameters ---
const outFloatPin = comp.newPin("output.float", hal.HAL_FLOAT, hal.HAL_OUT);
const inBitPin = comp.newPin("input.bit", hal.HAL_BIT, hal.HAL_IN);
const rwS32Param = comp.newParam("param.s32", hal.HAL_S32, hal.HAL_RW);
comp.newParam("param.u32.ro", hal.HAL_U32, hal.HAL_RO); // Read-only param

// --- Making Component Ready ---
comp.ready();
console.log(`Is 'my-js-comp' ready? ${hal.componentIsReady("my-js-comp")}`);

// --- Accessing Pin/Param Values (Proxy Interface) ---
comp["output.float"] = 123.45;
comp["param.s32"] = -100;

console.log(`Value of output.float: ${comp["output.float"]}`);
console.log(`Value of input.bit (not connected): ${comp["input.bit"]}`);

try {
  comp["param.u32.ro"] = 50; // This will throw an error
} catch (e) {
  console.error("Error setting RO param:", e.message);
}

// --- Using Pin/Param Objects ---
console.log(`Pin object value: ${outFloatPin.getValue()}`); // 123.45
rwS32Param.setValue(200);
console.log(`Param object value: ${rwS32Param.getValue()}`); // 200

// --- Global HAL Functions ---
hal.newSignal("my-js-signal", hal.HAL_BIT);
hal.connect("my-js-comp.output.float", "another-signal-float");
hal.setSignalValue("my-js-signal", true);
console.log(`Value of 'my-js-signal': ${hal.getValue("my-js-signal")}`);

// --- Information Functions ---
console.log("All Pins:", JSON.stringify(hal.getInfoPins(), null, 2));

// --- Message Levels ---
hal.setMsgLevel(hal.MSG_ALL);
console.log(`Current message level: ${hal.getMsgLevel()}`);
```

# API Reference

The main entry point is the `hal` object imported from the module.

### Module Entry Point

#### `hal.component(name: string, prefix?: string): HalComponentInstance`

Creates and returns a new HAL component instance, wrapped in the `HalComponent` class.

- `name: string`: The name of the component (e.g., "my-component"). This will be registered with LinuxCNC HAL.
- `prefix?: string` (optional): The prefix for pins and parameters created by this component. If not provided, defaults to `name`.
- **Returns:** An instance of `HalComponent` (typed as `HalComponentInstance` which includes dynamic properties for pins/params).

### `HalComponent` Class

This class (provided by the TypeScript wrapper) represents a HAL component. Instances are created via `hal.component()`.

**Properties:**

- `readonly name: string`: The name of the HAL component (e.g., "my-js-comp").
- `readonly prefix: string`: The prefix used for this component's pins and parameters (e.g., "my-js-comp" or a custom prefix).

**Methods:**

- `newPin(nameSuffix: string, type: HalType, direction: HalPinDir): Pin`

  - Creates a new HAL pin associated with this component.
  - `nameSuffix: string`: The suffix for the pin name (e.g., "in1", "motor.0.pos"). The full HAL name will be `this.prefix + "." + nameSuffix`.
  - `type: HalType`: The data type of the pin (e.g., `hal.HAL_FLOAT`, `hal.HAL_BIT`). See [Constants](#constants).
  - `direction: HalPinDir`: The direction of the pin (e.g., `hal.HAL_IN`, `hal.HAL_OUT`, `hal.HAL_IO`). See [Constants](#constants).
  - **Returns:** A new `Pin` object instance.
  - _Note:_ This method can only be called before `component.ready()` or after `component.unready()`.

- `newParam(nameSuffix: string, type: HalType, direction: HalParamDir): Param`

  - Creates a new HAL parameter associated with this component.
  - `nameSuffix: string`: The suffix for the parameter name. The full HAL name will be `this.prefix + "." + nameSuffix`.
  - `type: HalType`: The data type of the parameter. See [Constants](#constants).
  - `direction: HalParamDir`: The writability of the parameter (`hal.HAL_RO` for read-only, `hal.HAL_RW` for read-write). See [Constants](#constants).
  - **Returns:** A new `Param` object instance.
  - _Note:_ This method can only be called before `component.ready()` or after `component.unready()`.

- `ready(): void`

  - Marks this component as ready and available to the HAL system. Once ready, pins can be linked, and parameters can be accessed by other HAL components or tools.
  - Pins and parameters cannot be added after `ready()` is called, unless `unready()` is called first.

- `unready(): void`

  - Marks this component as not ready. This allows adding more pins or parameters. `ready()` must be called again to make the component (and any new items) available to HAL.

- `getPins(): { [key: string]: Pin }`

  - Retrieves a map of all `Pin` objects created for this component.
  - **Returns:** An object where keys are the `nameSuffix` of the pins and values are the corresponding `Pin` instances.

- `getParams(): { [key: string]: Param }`
  - Retrieves a map of all `Param` objects created for this component.
  - **Returns:** An object where keys are the `nameSuffix` of the parameters and values are the corresponding `Param` instances.

**Pin/Parameter Proxy Access:**
`HalComponent` instances use a JavaScript Proxy to allow direct property-like access to their pins and parameters using their `nameSuffix`.

```javascript
// Assuming 'comp' is a HalComponent instance
// and 'output1' is a pin/param suffix for that component.

// Set value (for OUT/IO pins or RW params)
comp["output1"] = 10.5;

// Get value
const val = comp["output1"];
```

This internally calls the native `getProperty` and `setProperty` methods of the underlying C++ `HalComponentWrapper`. Errors will be thrown if the item doesn't exist, or if you try to set a read-only item or an IN pin.

### `Pin` Class

Represents a HAL pin. Instances are returned by `component.newPin()`.

**Properties:**

- `readonly name: string`: The `nameSuffix` of the pin.
- `readonly type: HalType`: The HAL data type of the pin.
- `readonly direction: HalPinDir`: The direction of the pin.

**Methods:**

- `getValue(): number | boolean`
  - Retrieves the current value of this pin.
  - **Returns:** The pin's value.
- `setValue(value: number | boolean): number | boolean`
  - Sets the value of this pin. Only applicable to `HAL_OUT` or `HAL_IO` pins.
  - `value`: The new value for the pin.
  - **Returns:** The value that was set.
  - _Throws an error if trying to set an `HAL_IN` pin._

### `Param` Class

Represents a HAL parameter. Instances are returned by `component.newParam()`.

**Properties:**

- `readonly name: string`: The `nameSuffix` of the parameter.
- `readonly type: HalType`: The HAL data type of the parameter.
- `readonly direction: HalParamDir`: The writability of the parameter (`HAL_RO` or `HAL_RW`).

**Methods:**

- `getValue(): number | boolean`
  - Retrieves the current value of this parameter.
  - **Returns:** The parameter's value.
- `setValue(value: number | boolean): number | boolean`
  - Sets the value of this parameter.
  - `value`: The new value for the parameter.
  - **Returns:** The value that was set.

### Global HAL Functions (`hal.*`)

These functions operate on the global HAL state or on items identified by their full HAL name.

- `componentExists(name: string): boolean`

  - Checks if a HAL component with the given `name` (e.g., "halui", "my-custom-comp") exists in the system.
  - **Returns:** `true` if the component exists, `false` otherwise.

- `componentIsReady(name: string): boolean`

  - Checks if the HAL component with the given `name` has been marked as ready.
  - **Returns:** `true` if the component exists and is ready, `false` otherwise.

- `getMsgLevel(): RtapiMsgLevel`

  - Gets the current RTAPI message verbosity level used by HAL.
  - **Returns:** The current message level (e.g., `hal.MSG_INFO`). See [Constants](#constants).

- `setMsgLevel(level: RtapiMsgLevel): void`

  - Sets the RTAPI message verbosity level.
  - `level: RtapiMsgLevel`: The new message level to set.

- `connect(pinName: string, signalName: string): boolean`

  - Links a HAL pin to a HAL signal.
  - `pinName: string`: The full name of the pin (e.g., "my-comp.out1").
  - `signalName: string`: The name of the signal to connect to.
  - **Returns:** `true` on success, `false` on failure (error is thrown by native layer).

- `disconnect(pinName: string): boolean`

  - Unlinks a HAL pin from any signal it's currently connected to.
  - `pinName: string`: The full name of the pin.
  - **Returns:** `true` on success, `false` on failure (error is thrown).

- `newSignal(signalName: string, type: HalType): boolean`

  - Creates a new HAL signal.
  - `signalName: string`: The desired name for the new signal.
  - `type: HalType`: The data type for the new signal.
  - **Returns:** `true` on success, `false` on failure (error is thrown).

- `pinHasWriter(pinName: string): boolean`

  - Checks if the signal connected to an IN pin has at least one writer (another pin driving it).
  - `pinName: string`: The full name of the IN pin.
  - **Returns:** `true` if the pin is connected to a signal and that signal has one or more writers, `false` otherwise.
  - _Throws an error if the pin does not exist._

- `getValue(name: string): number | boolean`

  - Gets the current value of any HAL item (pin, parameter, or signal) identified by its full `name`.
  - **Returns:** The value of the item.
  - _Throws an error if the item is not found._

- `getInfoPins(): HalPinInfo[]`

  - Retrieves a list of all HAL pins currently in the system.
  - **Returns:** An array of `HalPinInfo` objects. See [Type Definitions](#type-definitions).

- `getInfoSignals(): HalSignalInfo[]`

  - Retrieves a list of all HAL signals currently in the system.
  - **Returns:** An array of `HalSignalInfo` objects. See [Type Definitions](#type-definitions).

- `getInfoParams(): HalParamInfo[]`

  - Retrieves a list of all HAL parameters currently in the system.
  - **Returns:** An array of `HalParamInfo` objects. See [Type Definitions](#type-definitions).

- `setPinParamValue(name: string, value: string | number | boolean): boolean`

  - Sets the value of a HAL pin or parameter identified by its full `name`.
  - The `value` is converted from its JavaScript type to a string and then parsed by the C++ layer, similar to `halcmd setp`.
  - This can set unconnected IN pins (modifying their internal `dummysig`) or RW parameters.
  - **Returns:** `true` on success, `false` on failure (error is thrown).
  - _Cannot set OUT pins or connected IN pins with this function (use direct signal manipulation or component proxy access for connected items where appropriate)._
  - _Cannot set RO parameters._

- `setSignalValue(name: string, value: string | number | boolean): boolean`
  - Sets the value of an unconnected HAL signal identified by its `name`.
  - The `value` is converted and parsed similarly to `setPinParamValue`.
  - **Returns:** `true` on success, `false` on failure (error is thrown).
  - _Throws an error if the signal has writers._

### Constants

The module exports various HAL and RTAPI constants, mirroring the enums defined in TypeScript (`HalType`, `HalPinDir`, `HalParamDir`, `RtapiMsgLevel`).

- **HAL Data Types (`hal.HAL_*`)**

  - `hal.HAL_BIT`: Boolean type.
  - `hal.HAL_FLOAT`: Double-precision floating point.
  - `hal.HAL_S32`: Signed 32-bit integer.
  - `hal.HAL_U32`: Unsigned 32-bit integer.
  - `hal.HAL_S64`: Signed 64-bit integer. (See [Limitations](#current-limitations))
  - `hal.HAL_U64`: Unsigned 64-bit integer. (See [Limitations](#current-limitations))

- **HAL Pin Directions (`hal.HAL_*`)**

  - `hal.HAL_IN`: Input pin.
  - `hal.HAL_OUT`: Output pin.
  - `hal.HAL_IO`: Bidirectional pin.

- **HAL Parameter Directions (`hal.HAL_*`)**

  - `hal.HAL_RO`: Read-only parameter.
  - `hal.HAL_RW`: Read-write parameter.

- **RTAPI Message Levels (`hal.MSG_*`)**
  - `hal.MSG_NONE`: No messages.
  - `hal.MSG_ERR`: Error messages only.
  - `hal.MSG_WARN`: Warning and error messages.
  - `hal.MSG_INFO`: Informational, warning, and error messages.
  - `hal.MSG_DBG`: Debug, informational, warning, and error messages.
  - `hal.MSG_ALL`: All messages.

### Type Definitions (Interfaces)

- `interface HalPinInfo`

  ```typescript
  {
  name: string; // Full name of the pin
  value: any; // Current value
  type: HalType; // HAL data type
  direction: HalPinDir; // Pin direction
  ownerId: number; // Component ID of the owner
  signalName?: string; // Name of the signal if connected, else undefined
  }
  ```

- `interface HalSignalInfo`

  ```typescript
  {
    name: string; // Full name of the signal
    value: any; // Current value
    type: HalType; // HAL data type
    driver: string | null; // Name of the driving pin, or null if no driver
    readers: number; // Number of pins reading this signal
    writers: number; // Number of pins writing to this signal
    bidirs: number; // Number of IO pins connected
  }
  ```

- `interface HalParamInfo`
  ```typescript
  {
    name: string; // Full name of the parameter
    value: any; // Current value
    type: HalType; // HAL data type
    direction: HalParamDir; // Parameter direction (RO/RW)
    ownerId: number; // Component ID of the owner
  }
  ```

### Current Limitations

- **64-bit Integers (`HAL_S64`, `HAL_U64`):**
  JavaScript's native `number` type is an IEEE 754 double-precision float. The C++ bindings convert 64-bit HAL integers to `double` for JavaScript. This means that integers larger than `Number.MAX_SAFE_INTEGER` (2<sup>53</sup>-1) or smaller than `Number.MIN_SAFE_INTEGER` will lose precision. Full `BigInt` support for 64-bit types is not implemented.
- **No `HAL_PORT` Support:**
  Binding, creation, and interaction with `HAL_PORT` type pins or signals are not currently implemented.

### Implementation Detail: `hal_priv.h`

To provide comprehensive bindings that closely match the functionality available in the C API (and subsequently the Python bindings), this library includes `hal_priv.h` from the LinuxCNC source repository. This header allows access to internal HAL data structures and functions (like `halpr_find_comp_by_name`, `hal_data->pin_list_ptr`, etc.). This approach aims for functional parity with `halcmd` and Python's `hal` library where possible.
