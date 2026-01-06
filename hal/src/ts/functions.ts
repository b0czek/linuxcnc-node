import type {
  HalType,
  RtapiMsgLevel,
  HalPinInfo,
  HalSignalInfo,
  HalParamInfo,
} from "@linuxcnc-node/types";
import {
  halNative,
  HalTypeValue,
  RtapiMsgLevelValue,
  HalTypeFromValue,
  HalPinDirFromValue,
  HalParamDirFromValue,
  RtapiMsgLevelFromValue,
} from "./constants";

/**
 * Gets the current RTAPI message verbosity level used by HAL.
 *
 * @returns The current message level (e.g., `hal.MSG_INFO`).
 *          See {@link RtapiMsgLevel} for available levels.
 */
export const getMsgLevel = (): RtapiMsgLevel => {
  const nativeValue = halNative.get_msg_level();
  return RtapiMsgLevelFromValue[nativeValue] ?? "none";
};

/**
 * Sets the RTAPI message verbosity level.
 *
 * @param level - The new message level to set. See {@link RtapiMsgLevel} for available levels.
 */
export const setMsgLevel = (level: RtapiMsgLevel): void => {
  halNative.set_msg_level(RtapiMsgLevelValue[level]);
};

/**
 * Links a HAL pin to a HAL signal.
 *
 * @param pinName - The full name of the pin (e.g., "my-comp.out1").
 * @param signalName - The name of the signal to connect to.
 * @returns `true` on success, `false` on failure (error is thrown by native layer).
 * @throws Error if pin or signal doesn't exist, or if connection fails.
 */
export const connect = (pinName: string, signalName: string): boolean => {
  return halNative.connect(pinName, signalName);
};

/**
 * Unlinks a HAL pin from any signal it's currently connected to.
 *
 * @param pinName - The full name of the pin.
 * @returns `true` on success, `false` on failure (error is thrown).
 * @throws Error if pin doesn't exist or disconnect fails.
 */
export const disconnect = (pinName: string): boolean => {
  return halNative.disconnect(pinName);
};

/**
 * Gets the current value of any HAL item (pin, parameter, or signal) identified by its full name.
 *
 * @param name - The full name of the pin, parameter, or signal.
 * @returns The value of the item (number or boolean).
 * @throws Error if the item is not found.
 */
export const getValue = (name: string): any => {
  return halNative.get_value(name);
};

/**
 * Retrieves a list of all HAL pins currently in the system.
 *
 * @returns An array of `HalPinInfo` objects. See {@link HalPinInfo} for structure.
 */
export const getInfoPins = (): HalPinInfo[] => {
  const nativePins = halNative.get_info_pins();
  return nativePins.map((pin: any) => ({
    ...pin,
    type: HalTypeFromValue[pin.type] ?? "bit",
    direction: HalPinDirFromValue[pin.direction] ?? "in",
  }));
};

/**
 * Retrieves a list of all HAL signals currently in the system.
 *
 * @returns An array of `HalSignalInfo` objects. See {@link HalSignalInfo} for structure.
 */
export const getInfoSignals = (): HalSignalInfo[] => {
  const nativeSignals = halNative.get_info_signals();
  return nativeSignals.map((signal: any) => ({
    ...signal,
    type: HalTypeFromValue[signal.type] ?? "bit",
  }));
};

/**
 * Retrieves a list of all HAL parameters currently in the system.
 *
 * @returns An array of `HalParamInfo` objects. See {@link HalParamInfo} for structure.
 */
export const getInfoParams = (): HalParamInfo[] => {
  const nativeParams = halNative.get_info_params();
  return nativeParams.map((param: any) => ({
    ...param,
    type: HalTypeFromValue[param.type] ?? "bit",
    direction: HalParamDirFromValue[param.direction] ?? "ro",
  }));
};

/**
 * Creates a new HAL signal.
 *
 * @param signalName - The desired name for the new signal.
 * @param type - The data type for the new signal. See {@link HalType} for available types.
 * @returns `true` on success, `false` on failure (error is thrown).
 * @throws Error if signal name already exists or creation fails.
 */
export const newSignal = (signalName: string, type: HalType): boolean => {
  return halNative.new_sig(signalName, HalTypeValue[type]);
};

/**
 * Checks if the signal connected to an IN pin has at least one writer (another pin driving it).
 *
 * @param pinName - The full name of the IN pin.
 * @returns `true` if the pin is connected to a signal and that signal has one or more writers,
 *          `false` otherwise.
 * @throws Error if the pin does not exist.
 */
export const pinHasWriter = (pinName: string): boolean => {
  return halNative.pin_has_writer(pinName);
};

/**
 * Sets the value of a HAL pin or parameter identified by its full name.
 *
 * The `value` is converted from its JavaScript type to a string and then parsed by
 * the C++ layer, similar to `halcmd setp`. This can set unconnected IN pins
 * (modifying their internal `dummysig`) or RW parameters.
 *
 * @param name - The full name of the pin or parameter.
 * @param value - The value to set (string, number, or boolean).
 * @returns `true` on success, `false` on failure (error is thrown).
 * @throws Error if item not found, if trying to set OUT pin or connected IN pin,
 *         or if value conversion fails.
 *
 * @remarks Cannot set OUT pins or connected IN pins with this function.
 *          Use direct signal manipulation or component proxy access for connected items.
 */
export const setPinParamValue = (
  name: string,
  value: string | number | boolean
): boolean => {
  return halNative.set_p(name, String(value));
};

/**
 * Sets the value of an unconnected HAL signal identified by its name.
 *
 * The `value` is converted and parsed similarly to `setPinParamValue`.
 *
 * @param name - The full name of the signal.
 * @param value - The value to set (string, number, or boolean).
 * @returns `true` on success, `false` on failure (error is thrown).
 * @throws Error if signal not found, if signal has writers, or if value conversion fails.
 */
export const setSignalValue = (
  name: string,
  value: string | number | boolean
): boolean => {
  return halNative.set_s(name, String(value));
};
