import { HalType, HalPinDir, HalParamDir } from './enums';

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
export type HalComponentInstance = HalComponent & { [key: string]: number | boolean };

export class HalComponent {
    private nativeInstance: NativeHalComponent;
    private proxyInstance: HalComponentInstance;
    
    private pins: { [key: string]: Pin } = {};
    private params: { [key: string]: Param } = {};

    // Public readonly properties to match wiki/python
    public readonly name: string;
    public readonly prefix: string;

    constructor(nativeInstance: NativeHalComponent, componentName: string, componentPrefix: string) {
        this.nativeInstance = nativeInstance;
        this.name = componentName; 
        this.prefix = componentPrefix;

        // The Proxy wraps `this` instance of HalComponent
        this.proxyInstance =  new Proxy(this, {
            get: (target: HalComponent, propKey: string | symbol, receiver: any): any => {
                if (typeof propKey === 'string') {
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
            set: (target: HalComponent, propKey: string | symbol, value: any, receiver: any): boolean => {
                if (typeof propKey === 'string') {
                    // Check if the property is an own property or method of HalComponent
                    if (Reflect.has(target, propKey)) {
                         return Reflect.set(target, propKey, value, receiver);
                    }
                    // Fallback to HAL item access via native setProperty
                    try {
                        if (typeof value === 'number' || typeof value === 'boolean') {
                            target.nativeInstance.setProperty(propKey, value);
                            return true;
                        } else {
                            console.error(`HAL item '${propKey}' can only be set to a number or boolean. Received type ${typeof value}.`);
                            return false;
                        }
                    } catch (e) {
                         throw e; 
                    }
                }
                return Reflect.set(target, propKey, value, receiver);
            }
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
        return new Param(this.proxyInstance, nameSuffix, type, direction);
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
}


export class Pin {
    private componentInstance: HalComponentInstance;
    public readonly name: string;
    public readonly type: HalType;
    public readonly direction: HalPinDir;

    constructor(componentInstance: HalComponentInstance, nameSuffix: string, type: HalType, direction: HalPinDir) {
        this.componentInstance = componentInstance;
        this.name = nameSuffix;
        this.type = type;
        this.direction = direction;
    }

    getValue(): number | boolean {
        return this.componentInstance[this.name] as number | boolean;
    }

    setValue(value: number | boolean): number | boolean {
        return this.componentInstance[this.name] = value;
    }

}

export class Param {
    private componentInstance: HalComponentInstance;
    public readonly name: string;
    public readonly type: HalType;
    public readonly direction: HalParamDir;

    constructor(componentInstance: HalComponentInstance, nameSuffix: string, type: HalType, direction: HalParamDir) {
        this.componentInstance = componentInstance;
        this.name = nameSuffix;
        this.type = type;
        this.direction = direction;
    }

    getValue(): number | boolean {
        return this.componentInstance[this.name] as number | boolean;
    }

    setValue(value: number | boolean): number | boolean {
        return this.componentInstance[this.name] = value;
    }
}