import { EventEmitter } from "events";
import type { HalType, HalPinDir, HalParamDir } from "@linuxcnc/types";
import type { HalComponent } from "./component";

/**
 * Base class for HAL pins and parameters.
 *
 * Extends EventEmitter to provide 'change' events when values are modified.
 *
 * @template D - The direction type (HalPinDir for pins, HalParamDir for params)
 *
 * @example
 * ```typescript
 * pin.on('change', (newValue, oldValue) => {
 *   console.log(`Value changed: ${oldValue} -> ${newValue}`);
 * });
 * ```
 */
export class HalItem<D extends HalPinDir | HalParamDir> extends EventEmitter {
  private component: HalComponent;

  /**
   * The `nameSuffix` of the item (e.g., "in1", "output").
   */
  public readonly name: string;

  /**
   * The HAL data type of the item.
   */
  public readonly type: HalType;

  /**
   * The direction of the item (pin direction or parameter direction).
   */
  public readonly direction: D;

  constructor(
    component: HalComponent,
    nameSuffix: string,
    type: HalType,
    direction: D
  ) {
    super();
    this.component = component;
    this.name = nameSuffix;
    this.type = type;
    this.direction = direction;
  }

  /**
   * Retrieves the current value of this item.
   *
   * @returns The item's value (number or boolean depending on type).
   */
  getValue(): number | boolean {
    return this.component.getValue(this.name);
  }

  /**
   * Sets the value of this item.
   *
   * For pins, only applicable to `HAL_OUT` or `HAL_IO` pins.
   * For parameters, only applicable to `HAL_RW` parameters.
   *
   * @param value - The new value for the item.
   * @returns The value that was set.
   * @throws Error if trying to set an `HAL_IN` pin or `HAL_RO` parameter.
   */
  setValue(value: number | boolean): number | boolean {
    return this.component.setValue(this.name, value);
  }
}

/**
 * Represents a HAL pin. Instances are returned by `component.newPin()`.
 *
 * @example
 * ```typescript
 * const pin = comp.newPin("output", "float", "out");
 * pin.setValue(123.45);
 * pin.on('change', (newVal, oldVal) => console.log(newVal));
 * ```
 */
export class Pin extends HalItem<HalPinDir> {}

/**
 * Represents a HAL parameter. Instances are returned by `component.newParam()`.
 *
 * @example
 * ```typescript
 * const param = comp.newParam("speed", "float", "rw");
 * param.setValue(100.0);
 * param.on('change', (newVal, oldVal) => console.log(newVal));
 * ```
 */
export class Param extends HalItem<HalParamDir> {}
