import { HalType, HalPinDir, HalParamDir } from "./enums";

export const DEFAULT_POLL_INTERVAL = 10; // Default polling interval in milliseconds

export type HalWatchCallback = (
  newValue: number | boolean,
  oldValue: number | boolean,
  object: Pin | Param
) => void;

export interface HalWatchOptions {
  pollInterval?: number;
}

export interface HalWatchedObject {
  object: Pin | Param;
  lastValue: number | boolean;
  callbacks: Set<HalWatchCallback>;
}

// This interface describes the N-API HalComponent class instance
export interface NativeHalComponent {
  newPin(nameSuffix: string, type: HalType, direction: HalPinDir): boolean;
  newParam(nameSuffix: string, type: HalType, direction: HalParamDir): boolean;
  ready(): void;
  unready(): void;
  getProperty(name: string): number | boolean;
  setProperty(name: string, value: number | boolean): number | boolean;
  readonly name: string;
  readonly prefix: string;
}

// Define the type for the proxied instance, combining HalComponent properties with the dynamic index signature
export type HalComponentInstance = HalComponent & {
  [key: string]: number | boolean;
};

export class HalComponent {
  private nativeInstance: NativeHalComponent;
  private proxyInstance: HalComponentInstance;

  private pins: { [key: string]: Pin } = {};
  private params: { [key: string]: Param } = {};

  // Monitoring system
  private watchedObjects: Map<string, HalWatchedObject> = new Map();
  private monitoringTimer: NodeJS.Timeout | null = null;
  private monitoringOptions: HalWatchOptions = {
    pollInterval: DEFAULT_POLL_INTERVAL,
  };

  // Public readonly properties to match wiki/python
  public readonly name: string;
  public readonly prefix: string;

  constructor(
    nativeInstance: NativeHalComponent,
    componentName: string,
    componentPrefix: string
  ) {
    this.nativeInstance = nativeInstance;
    this.name = componentName;
    this.prefix = componentPrefix;

    // The Proxy wraps `this` instance of HalComponent
    this.proxyInstance = new Proxy(this, {
      get: (
        target: HalComponent,
        propKey: string | symbol,
        receiver: any
      ): any => {
        if (typeof propKey === "string") {
          // Prioritize existing properties/methods of HalComponent class
          // Reflect.has checks own and prototype chain properties
          if (Reflect.has(target, propKey)) {
            return Reflect.get(target, propKey, receiver);
          }
          // Fallback to HAL item access via native getProperty
          try {
            return target.nativeInstance.getProperty(propKey); // Returns number | boolean
          } catch (e) {
            // Native getProperty should throw if item not found
            // console.warn(`HAL item '${propKey}' not found or error accessing:`, e);
            throw e; // Re-throw error to be more explicit
          }
        }
        return Reflect.get(target, propKey, receiver);
      },
      set: (
        target: HalComponent,
        propKey: string | symbol,
        value: any,
        receiver: any
      ): boolean => {
        if (typeof propKey === "string") {
          // Check if the property is an own property or method of HalComponent
          if (Reflect.has(target, propKey)) {
            return Reflect.set(target, propKey, value, receiver);
          }
          // Fallback to HAL item access via native setProperty
          try {
            if (typeof value === "number" || typeof value === "boolean") {
              target.nativeInstance.setProperty(propKey, value);
              return true;
            } else {
              console.error(
                `HAL item '${propKey}' can only be set to a number or boolean. Received type ${typeof value}.`
              );
              return false;
            }
          } catch (e) {
            throw e;
          }
        }
        return Reflect.set(target, propKey, value, receiver);
      },
    }) as HalComponentInstance;
    return this.proxyInstance;
  }

  /**
   * Creates a new HAL pin for this component.
   * @param nameSuffix The suffix for the pin name (e.g., "in1"). Full name will be "prefix.suffix".
   * @param type The data type of the pin.
   * @param direction The direction of the pin (IN, OUT, IO).
   * @returns A new Pin instance.
   */
  newPin(nameSuffix: string, type: HalType, direction: HalPinDir): Pin {
    const success = this.nativeInstance.newPin(nameSuffix, type, direction);
    if (!success) {
      // The native layer should throw an error on failure, so this might not be strictly needed
      console.error(`Failed to create pin '${nameSuffix}'`);
    }
    const pin = new Pin(this.proxyInstance, nameSuffix, type, direction);
    this.pins[nameSuffix] = pin;
    return pin;
  }

  /**
   * Creates a new HAL parameter for this component.
   * @param nameSuffix The suffix for the parameter name.
   * @param type The data type of the parameter.
   * @param direction The writability of the parameter (RO, RW).
   * @returns A new Param instance.
   */
  newParam(nameSuffix: string, type: HalType, direction: HalParamDir): Param {
    const success = this.nativeInstance.newParam(nameSuffix, type, direction);
    if (!success) {
      console.error(`Failed to create param '${nameSuffix}'`);
    }
    const param = new Param(this.proxyInstance, nameSuffix, type, direction);
    this.params[nameSuffix] = param;
    return param;
  }

  /**
   * Marks this component as ready and locks out adding new pins/params.
   */
  ready(): void {
    this.nativeInstance.ready();
  }

  /**
   * Allows a component to add pins/params after ready() has been called.
   * ready() must be called again afterwards.
   */
  unready(): void {
    this.nativeInstance.unready();
  }

  /**
   * Retrieves all pins in this component.
   * @returns Map of all pins in this component
   */
  getPins(): { [key: string]: Pin } {
    return this.pins;
  }

  /**
   * Retrieves all parameters in this component.
   * @returns Map of all parameters in this component
   */
  getParams(): { [key: string]: Param } {
    return this.params;
  }

  /**
   * Sets monitoring options for the component.
   * @param options Options to configure monitoring behavior
   */
  setMonitoringOptions(options: HalWatchOptions): void {
    this.monitoringOptions = { ...this.monitoringOptions, ...options };

    // Restart monitoring with new options if it's currently running
    if (this.monitoringTimer && this.watchedObjects.size > 0) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  /**
   * Gets current monitoring options.
   * @returns Current monitoring options
   */
  getMonitoringOptions(): HalWatchOptions {
    return { ...this.monitoringOptions };
  }

  /**
   * Adds a watch callback for a pin or parameter.
   * @param name Name of the pin or parameter to watch
   * @param callback Function to call when value changes
   */
  addWatch(name: string, callback: HalWatchCallback): void {
    // Validate name and callback
    const object = this.pins[name] || this.params[name];
    if (!object) {
      throw new Error(`No pin or parameter found with name '${name}'`);
    }

    let watchedObj = this.watchedObjects.get(name);

    if (!watchedObj) {
      // Get initial value
      const initialValue = this.proxyInstance[name] as number | boolean;
      watchedObj = {
        object,
        lastValue: initialValue,
        callbacks: new Set(),
      };
      this.watchedObjects.set(name, watchedObj);
    }

    watchedObj.callbacks.add(callback);

    // Start monitoring if this is the first watched object
    if (this.watchedObjects.size === 1 && !this.monitoringTimer) {
      this.startMonitoring();
    }
  }

  /**
   * Removes a watch callback for a pin or parameter.
   * @param name Name of the pin or parameter to unwatch
   * @param callback Function to remove from callbacks
   */
  removeWatch(name: string, callback: HalWatchCallback): void {
    const watchedObj = this.watchedObjects.get(name);
    if (watchedObj) {
      watchedObj.callbacks.delete(callback);

      // Remove the watched object if no callbacks remain
      if (watchedObj.callbacks.size === 0) {
        this.watchedObjects.delete(name);

        // Stop monitoring if no objects are being watched
        if (this.watchedObjects.size === 0) {
          this.stopMonitoring();
        }
      }
    }
  }

  /**
   * Gets the list of currently watched objects.
   * @returns Array of watched object names and types
   */
  getWatchedObjects(): Array<{
    object: Pin | Param;
    callbackCount: number;
  }> {
    return Array.from(this.watchedObjects.entries()).map(([name, obj]) => ({
      object: obj.object,
      callbackCount: obj.callbacks.size,
    }));
  }

  /**
   * Starts the monitoring timer.
   * @private
   */
  private startMonitoring(): void {
    if (this.monitoringTimer) {
      return; // Already monitoring
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
   * Checks all watched objects for value changes and triggers callbacks.
   * @private
   */
  private checkForChanges(): void {
    for (const [name, watchedObj] of this.watchedObjects.entries()) {
      try {
        const currentValue = this.proxyInstance[name] as number | boolean;

        if (currentValue !== watchedObj.lastValue) {
          const oldValue = watchedObj.lastValue;
          watchedObj.lastValue = currentValue;

          // Trigger all callbacks for this object
          for (const callback of watchedObj.callbacks) {
            try {
              callback(currentValue, oldValue, watchedObj.object);
            } catch (error) {
              console.error(`Error in watch callback for ${name}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error checking value for ${name}:`, error);
      }
    }
  }

  /**
   * Cleanup method to stop monitoring when component is destroyed.
   */
  destroy(): void {
    this.stopMonitoring();
    this.watchedObjects.clear();
  }
}

export class Pin {
  private componentInstance: HalComponentInstance;
  public readonly name: string;
  public readonly type: HalType;
  public readonly direction: HalPinDir;

  constructor(
    componentInstance: HalComponentInstance,
    nameSuffix: string,
    type: HalType,
    direction: HalPinDir
  ) {
    this.componentInstance = componentInstance;
    this.name = nameSuffix;
    this.type = type;
    this.direction = direction;
  }

  getValue(): number | boolean {
    return this.componentInstance[this.name] as number | boolean;
  }

  setValue(value: number | boolean): number | boolean {
    return (this.componentInstance[this.name] = value);
  }

  /**
   * Starts watching this pin for value changes.
   * @param callback Function to call when the pin value changes
   */
  watch(callback: HalWatchCallback): void {
    // Get the HalComponent instance from the proxy
    const component = this.componentInstance as HalComponent;
    component.addWatch(this.name, callback);
  }

  /**
   * Stops watching this pin for value changes.
   * @param callback The specific callback function to remove
   */
  removeWatch(callback: HalWatchCallback): void {
    // Get the HalComponent instance from the proxy
    const component = this.componentInstance as HalComponent;
    component.removeWatch(this.name, callback);
  }
}

export class Param {
  private componentInstance: HalComponentInstance;
  public readonly name: string;
  public readonly type: HalType;
  public readonly direction: HalParamDir;

  constructor(
    componentInstance: HalComponentInstance,
    nameSuffix: string,
    type: HalType,
    direction: HalParamDir
  ) {
    this.componentInstance = componentInstance;
    this.name = nameSuffix;
    this.type = type;
    this.direction = direction;
  }

  getValue(): number | boolean {
    return this.componentInstance[this.name] as number | boolean;
  }

  setValue(value: number | boolean): number | boolean {
    return (this.componentInstance[this.name] = value);
  }

  /**
   * Starts watching this parameter for value changes.
   * @param callback Function to call when the parameter value changes
   */
  watch(callback: HalWatchCallback): void {
    // Get the HalComponent instance from the proxy
    const component = this.componentInstance as HalComponent;
    component.addWatch(this.name, callback);
  }

  /**
   * Stops watching this parameter for value changes.
   * @param callback The specific callback function to remove
   */
  removeWatch(callback: HalWatchCallback): void {
    // Get the HalComponent instance from the proxy
    const component = this.componentInstance as HalComponent;
    component.removeWatch(this.name, callback);
  }
}
