// src/ts/enums.ts
export enum HalType {
    BIT = 1,
    FLOAT = 2,
    S32 = 3,
    U32 = 4,
    // PORT = 5, // Skipping PORT for now
    S64 = 6,
    U64 = 7,
}

export enum HalPinDir {
    IN = 16,
    OUT = 32,
    IO = 16 | 32, // 48
    DIR_UNSPECIFIED = -1,
}

export enum HalParamDir {
    RO = 64,
    RW = 64 | 128, // 192
}

export enum RtapiMsgLevel {
    NONE = 0,
    ERR = 1,
    WARN = 2,
    INFO = 3,
    DBG = 4,
    ALL = 5,
}

export interface HalPinInfo {
    name: string;
    value: any;
    type: HalType;
    direction: HalPinDir;
    ownerId: number;
    // undefined if pin is not connected to a signal
    signalName?: string;
}

export interface HalSignalInfo {
    name: string;
    value: any;
    type: HalType;
    driver: string | null; // Name of the driving pin
    readers: number;
    writers: number;
    bidirs: number;
}

export interface HalParamInfo {
    name: string;
    value: any;
    type: HalType;
    direction: HalParamDir;
    ownerId: number;
}