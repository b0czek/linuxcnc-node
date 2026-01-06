import type { HalType, HalPinDir, HalParamDir } from "@linuxcnc/types";
import {
  halNative,
  HalTypeValue,
  HalPinDirValue,
  HalParamDirValue,
} from "./constants";
import { HalItem, Pin, Param } from "./item";

/** Default polling interval in milliseconds for monitoring value changes */
export const DEFAULT_POLL_INTERVAL = 10;

/**
 * Configuration options for the monitoring system.
 */
export interface HalMonitorOptions {
  /** Polling interval in milliseconds (default: 10) */
  pollInterval?: number;
}

// This interface describes the N-API HalComponent class instance
export interface NativeHalComponent {
  newPin(nameSuffix: string, type: number, direction: number): boolean;
  newParam(nameSuffix: string, type: number, direction: number): boolean;
  ready(): void;
  unready(): void;
  getProperty(name: string): number | boolean;
  setProperty(name: string, value: number | boolean): number | boolean;
  readonly name: string;
  readonly prefix: string;
}

interface WatchedItem {
  item: HalItem<HalPinDir | HalParamDir>;
  lastValue: number | boolean;
}

/**
 * Represents a HAL component.
 *
 * This class provides functionality to create HAL components, pins, parameters,
 * and interact with the HAL environment.
 *
 * @example
 * ```typescript
 * const comp = new HalComponent("my-component");
 * const pin = comp.newPin("output", "float", "out");
 * comp.ready();
 * pin.setValue(123.45);
 *
 * // Listen for value changes
 * pin.on('change', (newVal, oldVal) => {
 *   console.log(`Changed: ${oldVal} -> ${newVal}`);
 * });
 * ```
 */
export class HalComponent {
  private nativeInstance: NativeHalComponent;

  private pins: { [key: string]: Pin } = {};
  private params: { [key: string]: Param } = {};

  // Monitoring system
  private watchedItems: Map<string, WatchedItem> = new Map();
  private monitoringTimer: NodeJS.Timeout | null = null;
  private monitoringOptions: HalMonitorOptions = {
    pollInterval: DEFAULT_POLL_INTERVAL,
  };

  /**
   * The name of the HAL component (e.g., "my-js-comp")
   */
  public readonly name: string;

  /**
   * The prefix used for this component's pins and parameters.
   * Defaults to the component name if not specified.
   */
  public readonly prefix: string;

  /**
   * Creates a new HAL component.
   *
   * @param name - The name of the component (e.g., "my-component").
   *               This will be registered with LinuxCNC HAL.
   * @param prefix - Optional prefix for pins and parameters created by this component.
   *                 If not provided, defaults to `name`.
   */
  constructor(name: string, prefix?: string) {
    this.nativeInstance = new halNative.HalComponent(name, prefix);
    this.name = name;
    this.prefix = prefix || name;
  }

  /**
   * Checks if a HAL component with the given name exists in the system.
   *
   * @param name - The component name (e.g., "halui", "my-custom-comp").
   * @returns `true` if the component exists, `false` otherwise.
   */
  static exists(name: string): boolean {
    return halNative.component_exists(name);
  }

  /**
   * Checks if the HAL component with the given name has been marked as ready.
   *
   * @param name - The component name.
   * @returns `true` if the component exists and is ready, `false` otherwise.
   */
  static isReady(name: string): boolean {
    return halNative.component_is_ready(name);
  }

  /**
   * Gets the value of a pin or parameter by name.
   *
   * @param name - The nameSuffix of the pin or parameter.
   * @returns The current value.
   */
  getValue(name: string): number | boolean {
    return this.nativeInstance.getProperty(name);
  }

  /**
   * Sets the value of a pin or parameter by name.
   *
   * @param name - The nameSuffix of the pin or parameter.
   * @param value - The value to set.
   * @returns The value that was set.
   */
  setValue(name: string, value: number | boolean): number | boolean {
    return this.nativeInstance.setProperty(name, value);
  }

  /**
   * Creates a new HAL pin associated with this component.
   *
   * This method can only be called before `ready()` or after `unready()`.
   *
   * @param nameSuffix - The suffix for the pin name (e.g., "in1", "motor.0.pos").
   *                     The full HAL name will be `this.prefix + "." + nameSuffix`.
   * @param type - The data type of the pin (e.g., `"float"`, `"bit"`).
   *               See {@link HalType} for available types.
   * @param direction - The direction of the pin (e.g., `"in"`, `"out"`, `"io"`).
   *                    See {@link HalPinDir} for available directions.
   * @returns A new `Pin` object instance.
   * @throws Error if component is ready or if pin creation fails.
   */
  newPin(nameSuffix: string, type: HalType, direction: HalPinDir): Pin {
    const success = this.nativeInstance.newPin(
      nameSuffix,
      HalTypeValue[type],
      HalPinDirValue[direction]
    );
    if (!success) {
      console.error(`Failed to create pin '${nameSuffix}'`);
    }
    const pin = new Pin(this, nameSuffix, type, direction);
    this.pins[nameSuffix] = pin;
    this.setupItemListeners(pin, nameSuffix);
    return pin;
  }

  /**
   * Creates a new HAL parameter associated with this component.
   *
   * This method can only be called before `ready()` or after `unready()`.
   *
   * @param nameSuffix - The suffix for the parameter name.
   *                     The full HAL name will be `this.prefix + "." + nameSuffix`.
   * @param type - The data type of the parameter. See {@link HalType} for available types.
   * @param direction - The writability of the parameter (`"ro"` for read-only,
   *                    `"rw"` for read-write). See {@link HalParamDir}.
   * @returns A new `Param` object instance.
   * @throws Error if component is ready or if parameter creation fails.
   */
  newParam(nameSuffix: string, type: HalType, direction: HalParamDir): Param {
    const success = this.nativeInstance.newParam(
      nameSuffix,
      HalTypeValue[type],
      HalParamDirValue[direction]
    );
    if (!success) {
      console.error(`Failed to create param '${nameSuffix}'`);
    }
    const param = new Param(this, nameSuffix, type, direction);
    this.params[nameSuffix] = param;
    this.setupItemListeners(param, nameSuffix);
    return param;
  }

  /**
   * Sets up auto-watch listeners for a pin or param.
   * @private
   */
  private setupItemListeners(
    item: HalItem<HalPinDir | HalParamDir>,
    name: string
  ): void {
    item.on("newListener", (event) => {
      if (event === "change" && !this.watchedItems.has(name)) {
        this.watchedItems.set(name, {
          item,
          lastValue: this.getValue(name),
        });
        this.ensureMonitoring();
      }
    });

    item.on("removeListener", (event) => {
      if (event === "change" && item.listenerCount("change") === 0) {
        this.watchedItems.delete(name);
        this.checkStopMonitoring();
      }
    });
  }

  /**
   * Marks this component as ready and available to the HAL system.
   *
   * Once ready, pins can be linked, and parameters can be accessed by other
   * HAL components or tools. Pins and parameters cannot be added after `ready()`
   * is called, unless `unready()` is called first.
   */
  ready(): void {
    this.nativeInstance.ready();
  }

  /**
   * Marks this component as not ready, allowing addition of more pins or parameters.
   *
   * `ready()` must be called again to make the component (and any new items)
   * available to HAL.
   */
  unready(): void {
    this.nativeInstance.unready();
  }

  /**
   * Retrieves a map of all `Pin` objects created for this component.
   *
   * @returns An object where keys are the `nameSuffix` of the pins and values
   *          are the corresponding `Pin` instances.
   */
  getPins(): { [key: string]: Pin } {
    return this.pins;
  }

  /**
   * Retrieves a map of all `Param` objects created for this component.
   *
   * @returns An object where keys are the `nameSuffix` of the parameters and
   *          values are the corresponding `Param` instances.
   */
  getParams(): { [key: string]: Param } {
    return this.params;
  }

  /**
   * Gets a pin by name.
   *
   * @param name - The nameSuffix of the pin.
   * @returns The Pin instance, or undefined if not found.
   */
  getPin(name: string): Pin | undefined {
    return this.pins[name];
  }

  /**
   * Gets a param by name.
   *
   * @param name - The nameSuffix of the param.
   * @returns The Param instance, or undefined if not found.
   */
  getParam(name: string): Param | undefined {
    return this.params[name];
  }

  /**
   * Configures the monitoring system settings.
   *
   * The monitoring system will check for value changes at the specified interval.
   *
   * @param options - Configuration object with `pollInterval` property (in milliseconds).
   *                  Default polling interval is 10ms.
   */
  setMonitoringOptions(options: HalMonitorOptions): void {
    this.monitoringOptions = { ...this.monitoringOptions, ...options };

    // Restart monitoring with new options if it's currently running
    if (this.monitoringTimer && this.watchedItems.size > 0) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  /**
   * Retrieves the current monitoring configuration.
   *
   * @returns A copy of the current monitoring options.
   */
  getMonitoringOptions(): HalMonitorOptions {
    return { ...this.monitoringOptions };
  }

  /**
   * Starts the monitoring timer if not already running.
   * @private
   */
  private ensureMonitoring(): void {
    if (!this.monitoringTimer && this.watchedItems.size > 0) {
      this.startMonitoring();
    }
  }

  /**
   * Stops monitoring if no items are being watched.
   * @private
   */
  private checkStopMonitoring(): void {
    if (this.watchedItems.size === 0) {
      this.stopMonitoring();
    }
  }

  /**
   * Starts the monitoring timer.
   * @private
   */
  private startMonitoring(): void {
    if (this.monitoringTimer) {
      return;
    }

    this.monitoringTimer = setInterval(() => {
      this.checkForChanges();
    }, this.monitoringOptions.pollInterval || DEFAULT_POLL_INTERVAL);
  }

  /**
   * Stops the monitoring timer.
   * @private
   */
  private stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  /**
   * Checks all watched items for value changes and emits 'change' events.
   * @private
   */
  private checkForChanges(): void {
    for (const [name, watched] of this.watchedItems.entries()) {
      try {
        const currentValue = this.getValue(name);

        if (currentValue !== watched.lastValue) {
          const oldValue = watched.lastValue;
          watched.lastValue = currentValue;
          watched.item.emit("change", currentValue, oldValue);
        }
      } catch (error) {
        console.error(`Error checking value for ${name}:`, error);
      }
    }
  }

  /**
   * Cleans up the component, stops monitoring and removes all listeners.
   *
   * Should be called when the component is no longer needed to prevent memory leaks.
   */
  dispose(): void {
    this.stopMonitoring();
    this.watchedItems.clear();

    // Remove all listeners from pins and params
    for (const pin of Object.values(this.pins)) {
      pin.removeAllListeners();
    }
    for (const param of Object.values(this.params)) {
      param.removeAllListeners();
    }
  }
}
