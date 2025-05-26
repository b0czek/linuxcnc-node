import * as hal from '../src/ts/index';
import {
    HalType,
    HalPinDir,
    HalParamDir,
    RtapiMsgLevel,
    HalPinInfo,
    HalSignalInfo,
    HalParamInfo,
} from '../src/ts/enums';
import { HalComponentInstance, HalComponent as HalComponentClass } from '../src/ts/component';

// Helper for unique names to avoid HAL conflicts between tests
let nameCounter = 0;
const uniqueName = (base: string): string => {
    // Sanitize base name to be HAL-compatible (letters, numbers, hyphens, underscores, periods)
    const sanitizedBase = base.replace(/[^a-zA-Z0-9\-_.]/g, '_');
    return `${sanitizedBase}-${Date.now()}-${nameCounter++}`;
};

// Utility to check for HalError from the native layer
const expectHalError = async (
    fn: () => any | Promise<any>,
    expectedMessagePart?: string | RegExp 
) => {
    try {
        await fn();
        // If fn completes without throwing, the test should fail.
        throw new Error('Expected function to throw, but it did not.');
    } catch (e: any) {
        const isHalError = e.message && typeof e.message === 'string' && e.message.startsWith('HalError:');
        const errorName = e.constructor?.name || e.name || 'UnknownError';
        const isTypeError = errorName === 'TypeError';

        if (!isHalError && !isTypeError) {
            // If it's neither our custom HalError nor a standard TypeError,
            // it's an unexpected error type for this helper's typical use cases.
            throw new Error(`Unexpected error type caught. Expected HalError (prefixed message) or TypeError instance, but got ${errorName}: ${e.message}`);
        }

        // Now check the message content if expectedMessagePart is provided
        if (expectedMessagePart) {
            // We check e.message directly, as the prefix check (for HalError) is already done.
            if (expectedMessagePart instanceof RegExp) {
                expect(e.message).toMatch(expectedMessagePart);
            } else {
                // For HalError, e.message includes "HalError: ".
                // For TypeError, e.message is just the core message.
                // .toContain() will work for both if expectedMessagePart is the core message.
                expect(e.message).toContain(expectedMessagePart);
            }
        }
        // If no expectedMessagePart, just confirming the error type was enough.
    }
};

// Jest timeout for potentially slow native calls or HAL interactions
jest.setTimeout(15000); // 15 seconds

describe('HAL Module Tests', () => {
    describe('HalComponent Class', () => {
        let compName: string;
        let comp: HalComponentInstance;

        beforeEach(() => {
            compName = uniqueName('hc-test');
            comp = hal.component(compName);
            expect(hal.componentExists(compName)).toBe(true);
        });

        it('should have correct name and prefix upon creation', () => {
            expect(comp.name).toBe(compName);
            expect(comp.prefix).toBe(compName); // Default prefix
        });

        it('should use custom prefix if provided', () => {
            const customPrefix = uniqueName('custom-prefix');
            const compWithPrefix = hal.component(uniqueName('comp-with-prefix'), customPrefix);
            expect(compWithPrefix.prefix).toBe(customPrefix);
        });

        describe('newPin()', () => {
            it('should create HAL_BIT pins (IN, OUT, IO)', () => {
                const pinIn = comp.newPin('bit.in', hal.HAL_BIT, hal.HAL_IN);
                expect(pinIn.name).toBe('bit.in');
                expect(pinIn.type).toBe(hal.HAL_BIT);
                expect(pinIn.direction).toBe(hal.HAL_IN);
                expect(comp.getPins()['bit.in']).toBe(pinIn);

                const pinOut = comp.newPin('bit.out', hal.HAL_BIT, hal.HAL_OUT);
                expect(pinOut.direction).toBe(hal.HAL_OUT);
                expect(comp.getPins()['bit.out']).toBe(pinOut);

                const pinIo = comp.newPin('bit.io', hal.HAL_BIT, hal.HAL_IO);
                expect(pinIo.direction).toBe(hal.HAL_IO);
                expect(comp.getPins()['bit.io']).toBe(pinIo);
            });

            it('should create HAL_FLOAT pins', () => {
                const pinFloatOut = comp.newPin('float.out', hal.HAL_FLOAT, hal.HAL_OUT);
                expect(pinFloatOut.type).toBe(hal.HAL_FLOAT);
            });

            it('should create HAL_S32 pins', () => {
                const pinS32In = comp.newPin('s32.in', hal.HAL_S32, hal.HAL_IN);
                expect(pinS32In.type).toBe(hal.HAL_S32);
            });

            it('should create HAL_U32 pins', () => {
                const pinU32Io = comp.newPin('u32.io', hal.HAL_U32, hal.HAL_IO);
                expect(pinU32Io.type).toBe(hal.HAL_U32);
            });
            
            it('should create HAL_S64 pins', () => {
                const pinS64Out = comp.newPin('s64.out', hal.HAL_S64, hal.HAL_OUT);
                expect(pinS64Out.type).toBe(hal.HAL_S64);
            });

            it('should create HAL_U64 pins', () => {
                const pinU64In = comp.newPin('u64.in', hal.HAL_U64, hal.HAL_IN);
                expect(pinU64In.type).toBe(hal.HAL_U64);
            });

            it('should throw error if component is ready', () => {
                comp.ready();
                expect(() => comp.newPin('after.ready', hal.HAL_BIT, hal.HAL_IN))
                    .toThrow(/Cannot add items after component is ready/);
            });

            it('should throw error for duplicate pin name_suffix', () => {
                comp.newPin('dup.pin', hal.HAL_BIT, hal.HAL_IN);
                expect(() => comp.newPin('dup.pin', hal.HAL_FLOAT, hal.HAL_OUT))
                    .toThrow(/Duplicate item name_suffix 'dup.pin'/);
            });

            it('should throw TypeError for invalid arguments from C++ N-API checks', () => {
                const expectedErrorMessage = "Expected: name_suffix (string), type (HalType), direction (HalPinDir/HalParamDir)";

                expect(() => (comp as any).newPin(123, hal.HAL_BIT, hal.HAL_IN))
                    .toThrowError(expectedErrorMessage);

                // For the other cases, if they also hit this C++ check:
                expect(() => comp.newPin('invalid.type', 'invalid' as any, hal.HAL_IN))
                    .toThrowError(expectedErrorMessage);

                expect(() => comp.newPin('invalid.dir', hal.HAL_BIT, 'invalid' as any))
                    .toThrowError(expectedErrorMessage);
            });
        });

        describe('newParam()', () => {
            it('should create HAL_BIT params (RO, RW)', () => {
                const paramRo = comp.newParam('bit.ro', hal.HAL_BIT, hal.HAL_RO);
                expect(paramRo.name).toBe('bit.ro');
                expect(paramRo.type).toBe(hal.HAL_BIT);
                expect(paramRo.direction).toBe(hal.HAL_RO);
                expect(comp.getParams()['bit.ro']).toBe(paramRo);

                const paramRw = comp.newParam('bit.rw', hal.HAL_BIT, hal.HAL_RW);
                expect(paramRw.direction).toBe(hal.HAL_RW);
                expect(comp.getParams()['bit.rw']).toBe(paramRw);
            });

            it('should create HAL_FLOAT params', () => {
                const paramFloatRw = comp.newParam('float.rw', hal.HAL_FLOAT, hal.HAL_RW);
                expect(paramFloatRw.type).toBe(hal.HAL_FLOAT);
            });

            it('should throw error if component is ready', () => {
                comp.ready();
                expect(() => comp.newParam('after.ready', hal.HAL_BIT, hal.HAL_RO))
                    .toThrow(/Cannot add items after component is ready/);
            });

            it('should throw error for duplicate param name_suffix', () => {
                comp.newParam('dup.param', hal.HAL_BIT, hal.HAL_RO);
                expect(() => comp.newParam('dup.param', hal.HAL_FLOAT, hal.HAL_RW))
                    .toThrow(/Duplicate item name_suffix 'dup.param'/);
            });
        });

        describe('ready() and unready()', () => {
            it('should set component to ready state', () => {
                expect(hal.componentIsReady(compName)).toBe(false);
                comp.ready();
                expect(hal.componentIsReady(compName)).toBe(true);
            });

            it('ready() should throw HalError if called on an already ready component', async () => {
                comp.ready();
                expect(hal.componentIsReady(compName)).toBe(true);

                await expectHalError(
                    () => comp.ready(),
                    /hal_ready failed|already ready/i
                );
                expect(hal.componentIsReady(compName)).toBe(true); // State should remain ready
            });

            it('should allow unready and adding new pins/params', () => {
                comp.newPin('p1', hal.HAL_BIT, hal.HAL_IN);
                comp.ready();
                expect(hal.componentIsReady(compName)).toBe(true);

                comp.unready();
                expect(hal.componentIsReady(compName)).toBe(false); 

                const p2 = comp.newPin('p2', hal.HAL_FLOAT, hal.HAL_OUT); 
                expect(p2.name).toBe('p2');
                expect(Object.keys(comp.getPins()).length).toBe(2);

                comp.ready(); 
                expect(hal.componentIsReady(compName)).toBe(true);
            });

            it('unready() should throw HalError if called on an already unready (or not yet ready) component', async () => {
                // Case 1: Component was never ready
                expect(hal.componentIsReady(compName)).toBe(false); // Initial state
                await expectHalError(
                    () => comp.unready(),
                    /hal_unready failed|already unready/i 
                );
                expect(hal.componentIsReady(compName)).toBe(false); // State should remain not ready

                // Case 2: Component was ready, then unreadied
                comp.ready(); // Make it ready
                expect(hal.componentIsReady(compName)).toBe(true);
                comp.unready(); // First unready, should succeed
                expect(hal.componentIsReady(compName)).toBe(false);

                await expectHalError(
                    () => comp.unready(),
                    /hal_unready failed|already unready/i
                );
                expect(hal.componentIsReady(compName)).toBe(false); // State should remain not ready
            });
        });

        describe('getPins() and getParams()', () => {
            it('should return a map of created pins', () => {
                const p1 = comp.newPin('pin1', hal.HAL_BIT, hal.HAL_IN);
                const p2 = comp.newPin('pin2', hal.HAL_FLOAT, hal.HAL_OUT);
                const pins = comp.getPins();
                expect(Object.keys(pins).length).toBe(2);
                expect(pins['pin1']).toBe(p1);
                expect(pins['pin2']).toBe(p2);
            });

            it('should return a map of created params', () => {
                const param1 = comp.newParam('param1', hal.HAL_S32, hal.HAL_RO);
                const param2 = comp.newParam('param2', hal.HAL_U32, hal.HAL_RW);
                const params = comp.getParams();
                expect(Object.keys(params).length).toBe(2);
                expect(params['param1']).toBe(param1);
                expect(params['param2']).toBe(param2);
            });
        });

        describe('Proxy Access (get/set)', () => {
            beforeEach(() => {
                // Pins
                comp.newPin('p.bit.in', hal.HAL_BIT, hal.HAL_IN);
                comp.newPin('p.bit.out', hal.HAL_BIT, hal.HAL_OUT);
                comp.newPin('p.bit.io', hal.HAL_BIT, hal.HAL_IO);
                comp.newPin('p.float.out', hal.HAL_FLOAT, hal.HAL_OUT);
                comp.newPin('p.s32.out', hal.HAL_S32, hal.HAL_OUT);
                comp.newPin('p.u32.out', hal.HAL_U32, hal.HAL_OUT);
                comp.newPin('p.s64.out', hal.HAL_S64, hal.HAL_OUT); 
                comp.newPin('p.u64.out', hal.HAL_U64, hal.HAL_OUT); 

                // Params
                comp.newParam('par.bit.ro', hal.HAL_BIT, hal.HAL_RO);
                comp.newParam('par.bit.rw', hal.HAL_BIT, hal.HAL_RW);
                comp.newParam('par.float.rw', hal.HAL_FLOAT, hal.HAL_RW);
                comp.newParam('par.s32.rw', hal.HAL_S32, hal.HAL_RW);

                comp.ready();
            });

            it('should get default values (typically 0 or false)', () => {
                expect(comp['p.bit.out']).toBe(false);
                expect(comp['p.float.out']).toBe(0.0);
                expect(comp['p.s32.out']).toBe(0);
                expect(comp['par.bit.rw']).toBe(false);
            });

            it('should set and get HAL_BIT values', () => {
                comp['p.bit.out'] = true;
                expect(comp['p.bit.out']).toBe(true);
                comp['p.bit.io'] = false;
                expect(comp['p.bit.io']).toBe(false);
                comp['par.bit.rw'] = true;
                expect(comp['par.bit.rw']).toBe(true);
            });

            it('should set and get HAL_FLOAT values', () => {
                comp['p.float.out'] = 123.456;
                expect(comp['p.float.out'] as number).toBeCloseTo(123.456);
                comp['par.float.rw'] = -0.5;
                expect(comp['par.float.rw'] as number).toBeCloseTo(-0.5);
            });

            it('should set and get HAL_S32 values', () => {
                comp['p.s32.out'] = -1000;
                expect(comp['p.s32.out']).toBe(-1000);
                comp['par.s32.rw'] = 2000;
                expect(comp['par.s32.rw']).toBe(2000);
            });

            it('should set and get HAL_U32 values', () => {
                comp['p.u32.out'] = 4000000000;
                expect(comp['p.u32.out']).toBe(4000000000);
            });
            
            it('should set and get HAL_S64 values (within JS safe integer range)', () => {
                if( (hal.HAL_U64 as number) === HalType.U32) {
                    console.warn('HAL_U64 is not supported in this environment, skipping S64 tests.');
                    return;
                }
                const safeInt = Math.trunc(Number.MAX_SAFE_INTEGER / 2); 
                comp['p.s64.out'] = safeInt;
                expect(comp['p.s64.out']).toBe(safeInt);
                comp['p.s64.out'] = -safeInt;
                expect(comp['p.s64.out']).toBe(-safeInt);
            });

            it('should set and get HAL_U64 values (within JS safe integer range)', () => {
                if ((hal.HAL_U64 as number) === HalType.U32) {
                    console.warn('HAL_U64 is not supported in this environment, skipping U64 tests.');
                    return;
                }
                const safeUint = Number.MAX_SAFE_INTEGER;
                comp['p.u64.out'] = safeUint;
                expect(comp['p.u64.out']).toBe(safeUint);
                comp['p.u64.out'] = 0;
                expect(comp['p.u64.out']).toBe(0);
            });
            
            it('should throw HalError when setting an IN pin', async () => {
                await expectHalError(() => { comp['p.bit.in'] = true; }, /Cannot set value of an IN pin/);
            });

            it('should throw HalError for non-existent property', async () => {
                await expectHalError(() => comp['non.existent.pin'], /not found on component/);
                await expectHalError(() => { comp['non.existent.pin'] = 1; }, /not found on component/);
            });

            it('should reject non-boolean/non-number values on set via proxy (TS layer check)', () => {
                const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

                // The assignment itself will throw the TypeError because the proxy's set trap returns false.
                expect(() => {
                    comp['p.bit.out'] = 'somestring' as any;
                }).toThrow(TypeError); // Or more specifically: .toThrowError(/trap returned falsish for property 'p.bit.out'/);

                // Verify the console.error was called before the TypeError was thrown by the engine
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining("HAL item 'p.bit.out' can only be set to a number or boolean. Received type string.")
                );

                // Check that the value didn't actually change due to the guard and subsequent error
                const originalValue = comp['p.bit.out']; 

                // Try the invalid assignment again, wrapped to catch the expected TypeError
                try {
                    comp['p.bit.out'] = 'test' as any;
                } catch (e: any) {
                    expect(e).toBeInstanceOf(TypeError); 
                }
                expect(comp['p.bit.out']).toBe(originalValue); // Should remain unchanged

                consoleErrorSpy.mockRestore();
            });
        });
    });

    describe('Pin Class (via HalComponent)', () => {
        let comp: HalComponentInstance;
        let pinOut: hal.Pin;
        let pinIn: hal.Pin;

        beforeEach(() => {
            comp = hal.component(uniqueName('pin-class-comp'));
            pinOut = comp.newPin('p.out', hal.HAL_FLOAT, hal.HAL_OUT);
            pinIn = comp.newPin('p.in', hal.HAL_BIT, hal.HAL_IN);
            comp.ready();
        });

        it('Pin.getValue() should retrieve value', () => {
            comp['p.out'] = 78.9;
            expect(pinOut.getValue()).toBeCloseTo(78.9);
            expect(pinIn.getValue()).toBe(false); 
        });

        it('Pin.setValue() should set value for OUT/IO pins', () => {
            pinOut.setValue(101.1);
            expect(comp['p.out'] as number).toBeCloseTo(101.1);
        });

        it('Pin.setValue() should throw HalError for IN pins', async () => {
            await expectHalError(() => pinIn.setValue(true), /Cannot set value of an IN pin/);
        });

        it('Pin properties should be correct', () => {
            expect(pinOut.name).toBe('p.out');
            expect(pinOut.type).toBe(hal.HAL_FLOAT);
            expect(pinOut.direction).toBe(hal.HAL_OUT);
        });
    });

    describe('Param Class (via HalComponent)', () => {
        let comp: HalComponentInstance;
        let paramRw: hal.Param;
        let paramRo: hal.Param;

        beforeEach(() => {
            comp = hal.component(uniqueName('param-class-comp'));
            paramRw = comp.newParam('par.rw', hal.HAL_S32, hal.HAL_RW);
            paramRo = comp.newParam('par.ro', hal.HAL_BIT, hal.HAL_RO);
            comp.ready();
        });

        it('Param.getValue() should retrieve value', () => {
            comp['par.rw'] = -500;
            expect(paramRw.getValue()).toBe(-500);
            expect(paramRo.getValue()).toBe(false); 
        });

        it('Param.setValue() should set value for RW params', () => {
            paramRw.setValue(999);
            expect(comp['par.rw']).toBe(999);
        });

         it('Param properties should be correct', () => {
            expect(paramRw.name).toBe('par.rw');
            expect(paramRw.type).toBe(hal.HAL_S32);
            expect(paramRw.direction).toBe(hal.HAL_RW);
        });
    });

    describe('Global HAL Functions', () => {
        let compA_name: string;
        let compA: HalComponentInstance;
        let compB_name: string;
        let compB: HalComponentInstance;

        beforeAll(() => {
            compA_name = uniqueName('global-compA');
            compA = hal.component(compA_name);
            compA.newPin('out.float', hal.HAL_FLOAT, hal.HAL_OUT);
            compA.newPin('in.bit', hal.HAL_BIT, hal.HAL_IN);
            compA.newParam('param.s32.rw', hal.HAL_S32, hal.HAL_RW);
            compA.newParam('param.u32.ro', hal.HAL_U32, hal.HAL_RO); // This RO param is for testing global set_p
            compA.ready();

            compB_name = uniqueName('global-compB');
            compB = hal.component(compB_name);
            compB.newPin('in.float', hal.HAL_FLOAT, hal.HAL_IN);
            compB.newPin('out.bit', hal.HAL_BIT, hal.HAL_OUT);
            compB.ready();
        });

        describe('componentExists() and componentIsReady()', () => {
            const nonExistentComp = uniqueName(`non-existent-comp`);
            it('componentExists should return true for existing components', () => {
                expect(hal.componentExists(compA_name)).toBe(true);
            });
            it('componentExists should return false for non-existing components', () => {
                expect(hal.componentExists(nonExistentComp)).toBe(false);
            });
            it('componentIsReady should return true for ready components', () => {
                expect(hal.componentIsReady(compA_name)).toBe(true);
            });
            it('componentIsReady should return false if component exists but not ready', () => {
                const tempCompName = uniqueName('temp-comp-not-ready');
                hal.component(tempCompName); 
                expect(hal.componentIsReady(tempCompName)).toBe(false);
            });
             it('componentIsReady should return false for non-existing components', () => {
                expect(hal.componentIsReady(nonExistentComp)).toBe(false);
            });
        });

        describe('getMsgLevel() and setMsgLevel()', () => {
            it('should set and get message levels', () => {
                const initialLevel = hal.getMsgLevel();
                
                hal.setMsgLevel(hal.MSG_ERR);
                expect(hal.getMsgLevel()).toBe(hal.MSG_ERR);

                hal.setMsgLevel(hal.MSG_ALL);
                expect(hal.getMsgLevel()).toBe(hal.MSG_ALL);

                hal.setMsgLevel(initialLevel); 
                expect(hal.getMsgLevel()).toBe(initialLevel);
            });

            it('setMsgLevel should throw TypeError for invalid input', async () => {
                await expectHalError(() => hal.setMsgLevel('invalid' as any), "Number expected for message level");
            });
        });

        describe('newSignal(), connect(), disconnect()', () => {
            let sigFloatName: string;
            let sigBitName: string;
            let compA_outFloat: string;
            let compB_inFloat: string;
            let compA_inBit: string;
            let compB_outBit: string;
            

            beforeEach(() => {
                sigFloatName = uniqueName('sig-float');
                sigBitName = uniqueName('sig-bit');
                compA_outFloat = `${compA_name}.out.float`;
                compB_inFloat = `${compB_name}.in.float`;
                compA_inBit = `${compA_name}.in.bit`;
                compB_outBit = `${compB_name}.out.bit`;
            });


            afterEach(async () => {
                try { hal.disconnect(compA_outFloat); } catch (e) {}
                try { hal.disconnect(compB_inFloat); } catch (e) {}
                try { hal.disconnect(compA_inBit); } catch (e) {}
                try { hal.disconnect(compB_outBit); } catch (e) {}
            });

            it('newSignal() should create a new signal', () => {
                expect(hal.newSignal(sigFloatName, hal.HAL_FLOAT)).toBe(true);
                expect(hal.newSignal(sigBitName, hal.HAL_BIT)).toBe(true);

                const signals = hal.getInfoSignals();
                expect(signals.find(s => s.name === sigFloatName && s.type === hal.HAL_FLOAT)).toBeDefined();
                expect(signals.find(s => s.name === sigBitName && s.type === hal.HAL_BIT)).toBeDefined();
            });

            it('newSignal() should throw HalError for duplicate signal name', async () => {
                const dupSigName = uniqueName('dup-sig');
                hal.newSignal(dupSigName, hal.HAL_BIT);
                await expectHalError(() => hal.newSignal(dupSigName, hal.HAL_FLOAT), /hal_signal_new failed/);
            });

            it('connect() should link compatible pin to signal', () => {
                hal.newSignal(sigFloatName, hal.HAL_FLOAT); 
                expect(hal.connect(compA_outFloat, sigFloatName)).toBe(true);
                const pinNameA = compA_outFloat.split('.').splice(1).join('.'); // Get just the pin name
                compA[pinNameA] = 12.34; 
                expect(hal.getValue(sigFloatName)).toBeCloseTo(12.34);

                expect(hal.connect(compB_inFloat, sigFloatName)).toBe(true);
                const pinNameB = compB_inFloat.split('.').splice(1).join('.'); // Get just the pin name
                expect(compB[pinNameB] as number).toBeCloseTo(12.34); 
            });

            it('connect() should throw HalError for non-existent pin or signal', async () => {
                const nonExistentPin = uniqueName('non-pin');
                const nonExistentSig = uniqueName('non-sig');
                hal.newSignal(sigBitName, hal.HAL_BIT);

                await expectHalError(() => hal.connect(nonExistentPin, sigBitName), /hal_link failed/); 
                await expectHalError(() => hal.connect(compA_inBit, nonExistentSig), /hal_link failed/); 
            });

            it('connect() should throw HalError for type mismatch', async () => {
                hal.newSignal(sigFloatName, hal.HAL_FLOAT);
                await expectHalError(() => hal.connect(compA_inBit, sigFloatName), /hal_link failed/i);
            });
             it('connect() should throw HalError for incompatible directions (e.g. two OUT pins to one signal)', async () => {
                const tempSig = uniqueName('temp-out-sig');
                hal.newSignal(tempSig, hal.HAL_BIT);
                const tempCompName = uniqueName('temp-out-comp');
                const tempComp = hal.component(tempCompName);
                tempComp.newPin('out1', hal.HAL_BIT, hal.HAL_OUT);
                tempComp.newPin('out2', hal.HAL_BIT, hal.HAL_OUT);
                tempComp.ready();

                expect(hal.connect(`${tempCompName}.out1`, tempSig)).toBe(true);
                await expectHalError(() => hal.connect(`${tempCompName}.out2`, tempSig), /hal_link failed/i);
            });

            it('disconnect() should unlink a pin', () => {
                hal.newSignal(sigBitName, hal.HAL_BIT);
                hal.connect(compA_inBit, sigBitName);
                
                let pinInfo = hal.getInfoPins().find(p => p.name === compA_inBit);
                expect(pinInfo?.signalName).toBe(sigBitName);

                expect(hal.disconnect(compA_inBit)).toBe(true);
                pinInfo = hal.getInfoPins().find(p => p.name === compA_inBit);
                expect(pinInfo?.signalName).toBeUndefined();
            });

            it('disconnect() should return true (not error) if pin exists but is not connected', () => {
                const unconnectedPinName = `${compB_name}.out.bit`;

                // Ensure it's truly unconnected for this test.
                // Since disconnect on an unconnected pin returns true and doesn't throw,
                // calling it here is safe and ensures state.
                hal.disconnect(unconnectedPinName);

                // Actual test: call disconnect on the known existing, unconnected pin.
                // It should return true and NOT throw an error.
                let result: boolean = false;
                expect(() => {
                    result = hal.disconnect(unconnectedPinName);
                }).not.toThrow(); // Assert that NO error is thrown

                expect(result).toBe(true); // Assert the return value is true

                // Verify it's still not connected
                const pinInfo = hal.getInfoPins().find(p => p.name === unconnectedPinName);
                expect(pinInfo).toBeDefined();
                expect(pinInfo?.signalName).toBeUndefined();
            });
        });

        describe('pinHasWriter()', () => {
            const writerSig = uniqueName('writer-sig');
            const noWriterSig = uniqueName('no-writer-sig');
            const compC_name = uniqueName('compC');
            const compC = hal.component(compC_name);
            const cPinIn = `${compC_name}.in`;
            const cPinOut = `${compC_name}.out`;
            compC.newPin('in', hal.HAL_BIT, hal.HAL_IN);
            compC.newPin('out', hal.HAL_BIT, hal.HAL_OUT);
            compC.ready();
            
            beforeAll(() => {
                hal.newSignal(writerSig, hal.HAL_BIT);
                hal.newSignal(noWriterSig, hal.HAL_BIT);
                hal.connect(cPinOut, writerSig); 
            });

            it('should return true for IN pin connected to signal with a writer', () => {
                hal.connect(cPinIn, writerSig);
                expect(hal.pinHasWriter(cPinIn)).toBe(true);
                hal.disconnect(cPinIn); 
            });

            it('should return false for IN pin connected to signal with no writer', () => {
                hal.connect(cPinIn, noWriterSig);
                expect(hal.pinHasWriter(cPinIn)).toBe(false);
                hal.disconnect(cPinIn); 
            });

            it('should return false for unconnected IN pin', () => {
                try { hal.disconnect(cPinIn); } catch (e) {}
                expect(hal.pinHasWriter(cPinIn)).toBe(false);
            });

            it('should return true for OUT pin if connected to signal with a writer (itself)', () => {
                expect(hal.pinHasWriter(cPinOut)).toBe(true);
            });
            
            it('should throw HalError for non-existent pin', async () => {
                await expectHalError(() => hal.pinHasWriter(uniqueName('non-pin')), /Pin .* does not exist/);
            });
        });

        describe('getValue()', () => {
            const sigForGetValue = uniqueName('sig-gv');
            beforeAll(() => {
                // reset from previous tests
                hal.setPinParamValue(`${compB_name}.in.float`, 0.0);


                hal.newSignal(sigForGetValue, hal.HAL_FLOAT);
                compA['out.float'] = 98.76;
                hal.connect(`${compA_name}.out.float`, sigForGetValue); 

                compA['param.s32.rw'] = -12345;
            });
            
            it('should get value of a pin', () => {
                expect(hal.getValue(`${compA_name}.out.float`)).toBeCloseTo(98.76); 
                expect(hal.getValue(`${compB_name}.in.float`)).toBe(0.0); 
            });

            it('should get value of a param', () => {
                expect(hal.getValue(`${compA_name}.param.s32.rw`)).toBe(-12345);
            });

            it('should get value of a signal', () => {
                expect(hal.getValue(sigForGetValue)).toBeCloseTo(98.76);
            });

            it('should throw HalError if item not found', async () => {
                await expectHalError(() => hal.getValue(uniqueName('non-item-gv')), /not found/);
            });
        });

        describe('getInfoPins(), getInfoSignals(), getInfoParams()', () => {
            const infoCompName = uniqueName('info-comp');
            const infoComp = hal.component(infoCompName);
            const pName = `${infoCompName}.p.info`;
            const parName = `${infoCompName}.par.info`;
            const sigName = uniqueName('sig.info');

            beforeAll(() => {
                infoComp.newPin('p.info', hal.HAL_U32, hal.HAL_IO);
                infoComp.newParam('par.info', hal.HAL_S64, hal.HAL_RW);
                infoComp.ready();
                hal.newSignal(sigName, hal.HAL_U32);
                hal.connect(pName, sigName); 
                infoComp['p.info'] = 123; 
                infoComp['par.info'] = 100; 
            });

            it('getInfoPins() should return list containing known pin', () => {
                const pins = hal.getInfoPins();
                expect(Array.isArray(pins)).toBe(true);
                const foundPin = pins.find(p => p.name === pName);
                expect(foundPin).toBeDefined();
                expect(foundPin?.type).toBe(hal.HAL_U32);
                expect(foundPin?.direction).toBe(hal.HAL_IO);
                expect(foundPin?.value).toBe(123); 
                expect(foundPin?.signalName).toBe(sigName);
                // Accessing nativeInstance properties like hal_id_ is an internal detail for testing
                // and might not be suitable if nativeInstance isn't exposed or its structure changes.
                const compInternal = infoComp as any;
                if (compInternal.nativeInstance && typeof compInternal.nativeInstance.hal_id_ !== 'undefined') {
                    expect(foundPin?.ownerId).toBe(compInternal.nativeInstance.hal_id_);
                } else {
                    // If hal_id_ is not easily accessible, we might skip this specific ownerId check
                    // or find another way to verify ownership if critical.
                    console.warn("Skipping ownerId check for pin in getInfoPins test due to inaccessible hal_id_");
                }
            });

            it('getInfoSignals() should return list containing known signal', () => {
                const signals = hal.getInfoSignals();
                expect(Array.isArray(signals)).toBe(true);
                const foundSignal = signals.find(s => s.name === sigName);
                expect(foundSignal).toBeDefined();
                expect(foundSignal?.type).toBe(hal.HAL_U32);
                expect(foundSignal?.value).toBe(123); 
                expect(foundSignal?.writers).toBe(0); 
                expect(foundSignal?.bidirs).toBe(1);
                expect(foundSignal?.driver).toBe(pName); 
            });

            it('getInfoParams() should return list containing known param', () => {
                const params = hal.getInfoParams();
                expect(Array.isArray(params)).toBe(true);
                const foundParam = params.find(p => p.name === parName);
                expect(foundParam).toBeDefined();
                expect(foundParam?.type).toBe(hal.HAL_S64);
                expect(foundParam?.direction).toBe(hal.HAL_RW);
                expect(foundParam?.value).toBe(100); 
                const compInternal = infoComp as any;
                 if (compInternal.nativeInstance && typeof compInternal.nativeInstance.hal_id_ !== 'undefined') {
                    expect(foundParam?.ownerId).toBe(compInternal.nativeInstance.hal_id_);
                } else {
                    console.warn("Skipping ownerId check for param in getInfoParams test due to inaccessible hal_id_");
                }
            });
        });

        describe('setPinParamValue()', () => {
            const setpCompName = uniqueName('setp-comp');
            const setpComp = hal.component(setpCompName);
            const unconnectedInPin = `${setpCompName}.unconn.in.bit`;
            const unconnectedOutPin = `${setpCompName}.unconn.out.bit`; 
            const rwParam = `${setpCompName}.rw.param.float`;
            beforeAll(() => {
                setpComp.newPin('unconn.in.bit', hal.HAL_BIT, hal.HAL_IN);
                setpComp.newPin('unconn.out.bit', hal.HAL_BIT, hal.HAL_OUT);
                setpComp.newParam('rw.param.float', hal.HAL_FLOAT, hal.HAL_RW);
                setpComp.ready();
            });
            
            it('should set value of unconnected IN pin', () => {
                expect(hal.setPinParamValue(unconnectedInPin, true)).toBe(true);
                expect(hal.getValue(unconnectedInPin)).toBe(true);
                expect(hal.setPinParamValue(unconnectedInPin, "false")).toBe(true); 
                expect(hal.getValue(unconnectedInPin)).toBe(false);
            });

            it('should set value of RW param', () => {
                expect(hal.setPinParamValue(rwParam, 123.789)).toBe(true);
                expect(hal.getValue(rwParam)).toBeCloseTo(123.789);
                expect(hal.setPinParamValue(rwParam, "-0.5")).toBe(true); 
                expect(hal.getValue(rwParam)).toBeCloseTo(-0.5);
            });

            it('should throw HalError for OUT pin', async () => {
                await expectHalError(() => hal.setPinParamValue(unconnectedOutPin, true), /Pin .* is an OUT pin/);
            });


            it('should throw HalError for connected IN pin', async () => {
                const connectedInPin = `${compA_name}.in.bit`; 
                const tempSigSetP = uniqueName('temp-sig-setp');
                hal.newSignal(tempSigSetP, hal.HAL_BIT);
                hal.connect(connectedInPin, tempSigSetP);

                await expectHalError(() => hal.setPinParamValue(connectedInPin, true), /Pin .* is connected to a signal/);
                hal.disconnect(connectedInPin); 
            });

            it('should throw HalError if item not found', async () => {
                await expectHalError(() => hal.setPinParamValue(uniqueName('non-item-setp'), true), /Pin\/param .* not found/);
            });
            
            it('should throw HalError for invalid value string for type', async () => {
                 await expectHalError(() => hal.setPinParamValue(rwParam, "not-a-float"), /Failed to set pin\/param/); 
            });
        });

        describe('setSignalValue()', () => {
            const sigSetS_unconn = uniqueName('sig-sets-unconn');
            const sigSetS_conn = uniqueName('sig-sets-conn'); 
            
            beforeAll(() => {
                hal.newSignal(sigSetS_unconn, hal.HAL_S32);
                hal.newSignal(sigSetS_conn, hal.HAL_BIT);
                hal.connect(`${compB_name}.out.bit`, sigSetS_conn); 
            });

            it('should set value of an unconnected signal', () => {
                expect(hal.setSignalValue(sigSetS_unconn, -999)).toBe(true);
                expect(hal.getValue(sigSetS_unconn)).toBe(-999);
                expect(hal.setSignalValue(sigSetS_unconn, "12345")).toBe(true); 
                expect(hal.getValue(sigSetS_unconn)).toBe(12345);
            });

            it('should throw HalError if signal has a writer', async () => {
                await expectHalError(() => hal.setSignalValue(sigSetS_conn, true), /Signal .* already has writer\(s\)/);
            });

            it('should throw HalError if signal not found', async () => {
                await expectHalError(() => hal.setSignalValue(uniqueName('non-sig-sets'), true), /Signal .* not found/);
            });
            
            it('should throw HalError for invalid value string for type', async () => {
                 await expectHalError(() => hal.setSignalValue(sigSetS_unconn, "not-an-s32"), /Failed to set signal/); 
            });
        });
    });

});