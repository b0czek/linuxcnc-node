import { HalType, HalPinDir, HalParamDir, RtapiMsgLevel, HalPinInfo, HalSignalInfo, HalParamInfo } from './enums';
import { HalComponent as HalComponentClass, HalComponentInstance, Pin, Param } from './component'; // Renamed to avoid conflict

let halNative: any;
const addonPathCandidates = [
    '../../build/Release/hal_addon.node',
    '../../build/Debug/hal_addon.node', // Fallback for debug builds
];

for (const candidate of addonPathCandidates) {
    try {
        halNative = require(candidate);
        break; // Found and loaded
    } catch (e) {
        if (candidate === addonPathCandidates[addonPathCandidates.length - 1]) { // Last attempt
            console.error("FATAL: Failed to load linuxcnc-node native addon. Please ensure it's built correctly and that LinuxCNC is in your PATH.");
            const loadError = e as Error;
            console.error("Details:", loadError.message);
            throw new Error("linuxcnc-node native addon could not be loaded.");
        }
    }
}

// --- Exported types and enums ---
export * from './enums'; // Exports HalType, HalPinDir, etc.

// --- Exported classes ---
export { HalComponentClass as HalComponent }; // Export the class as HalComponent
export { Pin, Param }; 

// --- Module-level functions ---

/**
 * Creates a new HAL component instance.
 * @param name The name of the component.
 * @param prefix Optional prefix for pin/param names. Defaults to component name.
 * @returns A HalComponent instance.
 */
export const component = (name: string, prefix?: string): HalComponentInstance => {
    // `halNative.HalComponent` is the N-API constructor function
    const nativeComponentInstance = new halNative.HalComponent(name, prefix);
    return new HalComponentClass(nativeComponentInstance, name, prefix || name) as HalComponentInstance;
};

export const componentExists = (name: string): boolean => {
    return halNative.component_exists(name);
};

export const componentIsReady = (name: string): boolean => {
    return halNative.component_is_ready(name);
};

export const getMsgLevel = (): RtapiMsgLevel => {
    return halNative.get_msg_level();
};

export const setMsgLevel = (level: RtapiMsgLevel): void => {
    halNative.set_msg_level(level);
};

export const connect = (pinName: string, signalName: string): boolean => {
    return halNative.connect(pinName, signalName);
};

export const disconnect = (pinName: string): boolean => {
    return halNative.disconnect(pinName);
};

export const getValue = (name: string): any => {
    return halNative.get_value(name);
};

export const getInfoPins = (): HalPinInfo[] => {
    return halNative.get_info_pins();
};

export const getInfoSignals = (): HalSignalInfo[] => {
    return halNative.get_info_signals();
};

export const getInfoParams = (): HalParamInfo[] => {
    return halNative.get_info_params();
};

export const newSignal = (signalName: string, type: HalType): boolean => {
    return halNative.new_sig(signalName, type);
};

export const pinHasWriter = (pinName: string): boolean => {
    return halNative.pin_has_writer(pinName);
};

/**
 * Sets the value of any HAL pin or parameter.
 * @param name The full name of the pin or parameter.
 * @param value The value to set
 */
export const setPinParamValue = (name: string, value: string | number | boolean): boolean => {
    return halNative.set_p(name, String(value));
};

/**
 * Sets the value of any unconnected HAL signal.
 * @param name The full name of the signal.
 * @param value The value to set
 */
export const setSignalValue = (name: string, value: string | number | boolean): boolean => {
    return halNative.set_s(name, String(value));
}

// Re-export constants from the native module for direct use (e.g., hal.HAL_FLOAT)
export const HAL_BIT: HalType.BIT = halNative.HAL_BIT;
export const HAL_FLOAT: HalType.FLOAT = halNative.HAL_FLOAT;
export const HAL_S32: HalType.S32 = halNative.HAL_S32;
export const HAL_U32: HalType.U32 = halNative.HAL_U32;
export const HAL_S64: HalType.S64 = halNative.HAL_S64;
export const HAL_U64: HalType.U64 = halNative.HAL_U64;

export const HAL_IN: HalPinDir.IN = halNative.HAL_IN;
export const HAL_OUT: HalPinDir.OUT = halNative.HAL_OUT;
export const HAL_IO: HalPinDir.IO = halNative.HAL_IO;

export const HAL_RO: HalParamDir.RO = halNative.HAL_RO;
export const HAL_RW: HalParamDir.RW = halNative.HAL_RW;

export const MSG_NONE: RtapiMsgLevel.NONE = halNative.MSG_NONE;
export const MSG_ERR: RtapiMsgLevel.ERR = halNative.MSG_ERR;
export const MSG_WARN: RtapiMsgLevel.WARN = halNative.MSG_WARN;
export const MSG_INFO: RtapiMsgLevel.INFO = halNative.MSG_INFO;
export const MSG_DBG: RtapiMsgLevel.DBG = halNative.MSG_DBG;
export const MSG_ALL: RtapiMsgLevel.ALL = halNative.MSG_ALL;