import * as hal from "../src/ts/index";
import type {
  HalType,
  HalPinDir,
  HalParamDir,
  RtapiMsgLevel,
  HalPinInfo,
  HalSignalInfo,
  HalParamInfo,
} from "@linuxcnc/types";
import { HalComponent as HalComponentClass } from "../src/ts/index";
import { Pin, Param } from "../src/ts/item";

// Helper for unique names to avoid HAL conflicts between tests
let nameCounter = 0;
const uniqueName = (base: string): string => {
  // Sanitize base name to be HAL-compatible (letters, numbers, hyphens, underscores, periods)
  const sanitizedBase = base.replace(/[^a-zA-Z0-9\-_.]/g, "_");
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
    throw new Error("Expected function to throw, but it did not.");
  } catch (e: any) {
    const isHalError =
      e.message &&
      typeof e.message === "string" &&
      e.message.startsWith("HalError:");
    const errorName = e.constructor?.name || e.name || "UnknownError";
    const isTypeError = errorName === "TypeError";
    const isError = errorName === "Error";

    if (!isHalError && !isTypeError && !isError) {
      // If it's neither our custom HalError nor a standard TypeError,
      // it's an unexpected error type for this helper's typical use cases.
      throw new Error(
        `Unexpected error type caught. Expected HalError (prefixed message) or TypeError instance, but got ${errorName}: ${e.message}`
      );
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

describe("HAL Module Tests", () => {
  describe("HalComponent Class", () => {
    let compName: string;
    let comp: HalComponentClass;

    beforeEach(() => {
      compName = uniqueName("hc-test");
      comp = new hal.HalComponent(compName);
      expect(hal.HalComponent.exists(compName)).toBe(true);
    });

    it("should have correct name and prefix upon creation", () => {
      expect(comp.name).toBe(compName);
      expect(comp.prefix).toBe(compName); // Default prefix
    });

    it("should use custom prefix if provided", () => {
      const customPrefix = uniqueName("custom-prefix");
      const compWithPrefix = new hal.HalComponent(
        uniqueName("comp-with-prefix"),
        customPrefix
      );
      expect(compWithPrefix.prefix).toBe(customPrefix);
    });

    describe("newPin()", () => {
      it("should create HAL_BIT pins (IN, OUT, IO)", () => {
        const pinIn = comp.newPin("bit.in", "bit", "in");
        expect(pinIn.name).toBe("bit.in");
        expect(pinIn.type).toBe("bit");
        expect(pinIn.direction).toBe("in");
        expect(comp.getPins()["bit.in"]).toBe(pinIn);

        const pinOut = comp.newPin("bit.out", "bit", "out");
        expect(pinOut.direction).toBe("out");
        expect(comp.getPins()["bit.out"]).toBe(pinOut);

        const pinIo = comp.newPin("bit.io", "bit", "io");
        expect(pinIo.direction).toBe("io");
        expect(comp.getPins()["bit.io"]).toBe(pinIo);
      });

      it("should throw error if component is ready", () => {
        comp.ready();
        expect(() => comp.newPin("after.ready", "bit", "in")).toThrow(
          /Cannot add items after component is ready/
        );
      });

      it("should throw error for duplicate pin name_suffix", () => {
        comp.newPin("dup.pin", "bit", "in");
        expect(() => comp.newPin("dup.pin", "float", "out")).toThrow(
          /Duplicate item name_suffix 'dup.pin'/
        );
      });

      it("should throw TypeError for invalid arguments from C++ N-API checks", () => {
        expect(() => (comp as any).newPin(123, "bit", "in")).toThrow();

        expect(() =>
          comp.newPin("invalid.type", "invalid" as any, "in")
        ).toThrow();

        expect(() =>
          comp.newPin("invalid.dir", "bit", "invalid" as any)
        ).toThrow();
      });
    });

    describe("newParam()", () => {
      it("should create HAL_BIT params (RO, RW)", () => {
        const paramRo = comp.newParam("bit.ro", "bit", "ro");
        expect(paramRo.name).toBe("bit.ro");
        expect(paramRo.type).toBe("bit");
        expect(paramRo.direction).toBe("ro");
        expect(comp.getParams()["bit.ro"]).toBe(paramRo);

        const paramRw = comp.newParam("bit.rw", "bit", "rw");
        expect(paramRw.direction).toBe("rw");
        expect(comp.getParams()["bit.rw"]).toBe(paramRw);
      });

      it("should throw error if component is ready", () => {
        comp.ready();
        expect(() => comp.newParam("after.ready", "bit", "ro")).toThrow(
          /Cannot add items after component is ready/
        );
      });

      it("should throw error for duplicate param name_suffix", () => {
        comp.newParam("dup.param", "bit", "ro");
        expect(() => comp.newParam("dup.param", "float", "rw")).toThrow(
          /Duplicate item name_suffix 'dup.param'/
        );
      });
    });

    describe("ready() and unready()", () => {
      it("should set component to ready state", () => {
        expect(hal.HalComponent.isReady(compName)).toBe(false);
        comp.ready();
        expect(hal.HalComponent.isReady(compName)).toBe(true);
      });

      it("ready() should throw HalError if called on an already ready component", async () => {
        comp.ready();
        expect(hal.HalComponent.isReady(compName)).toBe(true);

        await expectHalError(
          () => comp.ready(),
          /hal_ready failed|already ready/i
        );
        expect(hal.HalComponent.isReady(compName)).toBe(true); // State should remain ready
      });

      it("should allow unready and adding new pins/params", () => {
        comp.newPin("p1", "bit", "in");
        comp.ready();
        expect(hal.HalComponent.isReady(compName)).toBe(true);

        comp.unready();
        expect(hal.HalComponent.isReady(compName)).toBe(false);

        const p2 = comp.newPin("p2", "float", "out");
        expect(p2.name).toBe("p2");
        expect(Object.keys(comp.getPins()).length).toBe(2);

        comp.ready();
        expect(hal.HalComponent.isReady(compName)).toBe(true);
      });

      it("unready() should throw HalError if called on an already unready (or not yet ready) component", async () => {
        // Case 1: Component was never ready
        expect(hal.HalComponent.isReady(compName)).toBe(false); // Initial state
        await expectHalError(
          () => comp.unready(),
          /hal_unready failed|already unready/i
        );
        expect(hal.HalComponent.isReady(compName)).toBe(false); // State should remain not ready

        // Case 2: Component was ready, then unreadied
        comp.ready(); // Make it ready
        expect(hal.HalComponent.isReady(compName)).toBe(true);
        comp.unready(); // First unready, should succeed
        expect(hal.HalComponent.isReady(compName)).toBe(false);

        await expectHalError(
          () => comp.unready(),
          /hal_unready failed|already unready/i
        );
        expect(hal.HalComponent.isReady(compName)).toBe(false); // State should remain not ready
      });
    });

    describe("Value Access (getValue/setValue)", () => {
      beforeEach(() => {
        // Pins
        comp.newPin("p.bit.in", "bit", "in");
        comp.newPin("p.bit.out", "bit", "out");
        comp.newPin("p.bit.io", "bit", "io");
        comp.newPin("p.float.out", "float", "out");
        comp.newPin("p.s32.out", "s32", "out");
        comp.newPin("p.u32.out", "u32", "out");
        comp.newPin("p.s64.out", "s64", "out");
        comp.newPin("p.u64.out", "u64", "out");

        // Params
        comp.newParam("par.bit.ro", "bit", "ro");
        comp.newParam("par.bit.rw", "bit", "rw");
        comp.newParam("par.float.rw", "float", "rw");
        comp.newParam("par.s32.rw", "s32", "rw");

        comp.ready();
      });

      it("should get default values (typically 0 or false)", () => {
        expect(comp.getValue("p.bit.out")).toBe(false);
        expect(comp.getValue("p.float.out")).toBe(0.0);
        expect(comp.getValue("p.s32.out")).toBe(0);
        expect(comp.getValue("par.bit.rw")).toBe(false);
      });

      it("should set and get HAL_BIT values", () => {
        comp.setValue("p.bit.out", true);
        expect(comp.getValue("p.bit.out")).toBe(true);
        comp.setValue("p.bit.io", false);
        expect(comp.getValue("p.bit.io")).toBe(false);
        comp.setValue("par.bit.rw", true);
        expect(comp.getValue("par.bit.rw")).toBe(true);
      });

      it("should set and get HAL_FLOAT values", () => {
        comp.setValue("p.float.out", 123.456);
        expect(comp.getValue("p.float.out") as number).toBeCloseTo(123.456);
        comp.setValue("par.float.rw", -0.5);
        expect(comp.getValue("par.float.rw") as number).toBeCloseTo(-0.5);
      });

      it("should set and get HAL_S32 values", () => {
        comp.setValue("p.s32.out", -1000);
        expect(comp.getValue("p.s32.out")).toBe(-1000);
        comp.setValue("par.s32.rw", 2000);
        expect(comp.getValue("par.s32.rw")).toBe(2000);
      });

      it("should set and get HAL_U32 values", () => {
        comp.setValue("p.u32.out", 4000000000);
        expect(comp.getValue("p.u32.out")).toBe(4000000000);
      });

      it("should set and get HAL_S64 values (within JS safe integer range)", () => {
        const safeInt = Math.trunc(Number.MAX_SAFE_INTEGER / 2);
        comp.setValue("p.s64.out", safeInt);
        expect(comp.getValue("p.s64.out")).toBe(safeInt);
        comp.setValue("p.s64.out", -safeInt);
        expect(comp.getValue("p.s64.out")).toBe(-safeInt);
      });

      it("should set and get HAL_U64 values (within JS safe integer range)", () => {
        const safeUint = Number.MAX_SAFE_INTEGER;
        comp.setValue("p.u64.out", safeUint);
        expect(comp.getValue("p.u64.out")).toBe(safeUint);
        comp.setValue("p.u64.out", 0);
        expect(comp.getValue("p.u64.out")).toBe(0);
      });

      it("should throw HalError when setting an IN pin", async () => {
        await expectHalError(() => {
          comp.setValue("p.bit.in", true);
        }, /Cannot set value of an IN pin/);
      });

      it("should throw HalError for non-existent item in getValue/setValue", async () => {
        await expectHalError(
          () => comp.getValue("non.existent.pin"),
          /not found/
        );
        await expectHalError(() => {
          comp.setValue("non.existent.pin", 1);
        }, /not found/);
      });

      it("should reject non-boolean/non-number values on set (Validation)", () => {
        expect(() => {
          comp.setValue("p.bit.out", "somestring" as any);
        }).toThrow();
      });
    });
  });

  describe("Pin Class (via HalComponent)", () => {
    let comp: HalComponentClass;
    let pinOut: Pin;
    let pinIn: Pin;

    beforeEach(() => {
      comp = new hal.HalComponent(uniqueName("pin-class-comp"));
      pinOut = comp.newPin("p.out", "float", "out");
      pinIn = comp.newPin("p.in", "bit", "in");
      comp.ready();
    });

    it("Pin.getValue() should retrieve value", () => {
      comp.setValue("p.out", 78.9);
      expect(pinOut.getValue()).toBeCloseTo(78.9);
      expect(pinIn.getValue()).toBe(false);
    });

    it("Pin.setValue() should set value for OUT/IO pins", () => {
      pinOut.setValue(101.1);
      expect(comp.getValue("p.out") as number).toBeCloseTo(101.1);
    });

    it("Pin.setValue() should throw HalError for IN pins", async () => {
      await expectHalError(
        () => pinIn.setValue(true),
        /Cannot set value of an IN pin/
      );
    });
  });

  describe("Param Class (via HalComponent)", () => {
    let comp: HalComponentClass;
    let paramRw: Param;
    let paramRo: Param;

    beforeEach(() => {
      comp = new hal.HalComponent(uniqueName("param-class-comp"));
      paramRw = comp.newParam("par.rw", "s32", "rw");
      paramRo = comp.newParam("par.ro", "bit", "ro");
      comp.ready();
    });

    it("Param.getValue() should retrieve value", () => {
      comp.setValue("par.rw", -500);
      expect(paramRw.getValue()).toBe(-500);
      expect(paramRo.getValue()).toBe(false);
    });

    it("Param.setValue() should set value for RW params", () => {
      paramRw.setValue(999);
      expect(comp.getValue("par.rw")).toBe(999);
    });
  });

  describe("Global HAL Functions", () => {
    let compA_name: string;
    let compA: HalComponentClass;
    let compB_name: string;
    let compB: HalComponentClass;

    beforeAll(() => {
      compA_name = uniqueName("global-compA");
      compA = new hal.HalComponent(compA_name);
      compA.newPin("out.float", "float", "out");
      compA.newPin("in.bit", "bit", "in");
      compA.newParam("param.s32.rw", "s32", "rw");
      compA.newParam("param.u32.ro", "u32", "ro"); // This RO param is for testing global set_p
      compA.ready();

      compB_name = uniqueName("global-compB");
      compB = new hal.HalComponent(compB_name);
      compB.newPin("in.float", "float", "in");
      compB.newPin("out.bit", "bit", "out");
      compB.ready();
    });

    describe("componentExists() and componentIsReady()", () => {
      const nonExistentComp = uniqueName(`non-existent-comp`);
      it("componentExists should return true for existing components", () => {
        expect(hal.HalComponent.exists(compA_name)).toBe(true);
      });
      it("componentExists should return false for non-existing components", () => {
        expect(hal.HalComponent.exists(nonExistentComp)).toBe(false);
      });
      it("componentIsReady should return true for ready components", () => {
        expect(hal.HalComponent.isReady(compA_name)).toBe(true);
      });
      it("componentIsReady should return false if component exists but not ready", () => {
        const tempCompName = uniqueName("temp-comp-not-ready");
        new hal.HalComponent(tempCompName);
        expect(hal.HalComponent.isReady(tempCompName)).toBe(false);
      });
      it("componentIsReady should return false for non-existing components", () => {
        expect(hal.HalComponent.isReady(nonExistentComp)).toBe(false);
      });
    });

    describe("getMsgLevel() and setMsgLevel()", () => {
      it("should set and get message levels", () => {
        const initialLevel = hal.getMsgLevel();

        hal.setMsgLevel("err");
        expect(hal.getMsgLevel()).toBe("err");

        hal.setMsgLevel("all");
        expect(hal.getMsgLevel()).toBe("all");

        hal.setMsgLevel(initialLevel);
        expect(hal.getMsgLevel()).toBe(initialLevel);
      });

      it("setMsgLevel should throw error for invalid input", () => {
        expect(() => hal.setMsgLevel("invalid" as any)).toThrow();
      });
    });

    describe("newSignal(), connect(), disconnect()", () => {
      let sigFloatName: string;
      let sigBitName: string;
      let compA_outFloat: string;
      let compB_inFloat: string;
      let compA_inBit: string;
      let compB_outBit: string;

      beforeEach(() => {
        sigFloatName = uniqueName("sig-float");
        sigBitName = uniqueName("sig-bit");
        compA_outFloat = `${compA_name}.out.float`;
        compB_inFloat = `${compB_name}.in.float`;
        compA_inBit = `${compA_name}.in.bit`;
        compB_outBit = `${compB_name}.out.bit`;
      });

      afterEach(async () => {
        try {
          hal.disconnect(compA_outFloat);
        } catch (e) {}
        try {
          hal.disconnect(compB_inFloat);
        } catch (e) {}
        try {
          hal.disconnect(compA_inBit);
        } catch (e) {}
        try {
          hal.disconnect(compB_outBit);
        } catch (e) {}
      });

      it("newSignal() should create a new signal", () => {
        expect(hal.newSignal(sigFloatName, "float")).toBe(true);
        expect(hal.newSignal(sigBitName, "bit")).toBe(true);

        const signals = hal.getInfoSignals();
        expect(
          signals.find((s) => s.name === sigFloatName && s.type === "float")
        ).toBeDefined();
        expect(
          signals.find((s) => s.name === sigBitName && s.type === "bit")
        ).toBeDefined();
      });

      it("newSignal() should throw HalError for duplicate signal name", async () => {
        const dupSigName = uniqueName("dup-sig");
        hal.newSignal(dupSigName, "bit");
        await expectHalError(
          () => hal.newSignal(dupSigName, "float"),
          /hal_signal_new failed/
        );
      });

      it("connect() should link compatible pin to signal", () => {
        hal.newSignal(sigFloatName, "float");
        expect(hal.connect(compA_outFloat, sigFloatName)).toBe(true);
        const pinNameA = compA_outFloat.split(".").splice(1).join("."); // Get just the pin name
        compA.setValue(pinNameA, 12.34);
        expect(hal.getValue(sigFloatName)).toBeCloseTo(12.34);

        expect(hal.connect(compB_inFloat, sigFloatName)).toBe(true);
        const pinNameB = compB_inFloat.split(".").splice(1).join(".");
        expect(compB.getValue(pinNameB) as number).toBeCloseTo(12.34);
      });

      it("connect() should throw HalError for non-existent pin or signal", async () => {
        const nonExistentPin = uniqueName("non-pin");
        const nonExistentSig = uniqueName("non-sig");
        hal.newSignal(sigBitName, "bit");

        await expectHalError(
          () => hal.connect(nonExistentPin, sigBitName),
          /hal_link failed/
        );
        await expectHalError(
          () => hal.connect(compA_inBit, nonExistentSig),
          /hal_link failed/
        );
      });

      it("connect() should throw HalError for type mismatch", async () => {
        hal.newSignal(sigFloatName, "float");
        await expectHalError(
          () => hal.connect(compA_inBit, sigFloatName),
          /hal_link failed/i
        );
      });
      it("connect() should throw HalError for incompatible directions (e.g. two OUT pins to one signal)", async () => {
        const tempSig = uniqueName("temp-out-sig");
        hal.newSignal(tempSig, "bit");
        const tempCompName = uniqueName("temp-out-comp");
        const tempComp = new hal.HalComponent(tempCompName);
        tempComp.newPin("out1", "bit", "out");
        tempComp.newPin("out2", "bit", "out");
        tempComp.ready();

        expect(hal.connect(`${tempCompName}.out1`, tempSig)).toBe(true);
        await expectHalError(
          () => hal.connect(`${tempCompName}.out2`, tempSig),
          /hal_link failed/i
        );
      });

      it("disconnect() should unlink a pin", () => {
        hal.newSignal(sigBitName, "bit");
        hal.connect(compA_inBit, sigBitName);

        let pinInfo = hal.getInfoPins().find((p) => p.name === compA_inBit);
        expect(pinInfo?.signalName).toBe(sigBitName);

        expect(hal.disconnect(compA_inBit)).toBe(true);
        pinInfo = hal.getInfoPins().find((p) => p.name === compA_inBit);
        expect(pinInfo?.signalName).toBeUndefined();
      });

      it("disconnect() should return true (not error) if pin exists but is not connected", () => {
        const unconnectedPinName = `${compB_name}.out.bit`;

        // Ensure it's truly unconnected for this test.
        hal.disconnect(unconnectedPinName);

        // Actual test: call disconnect on the known existing, unconnected pin.
        let result: boolean = false;
        expect(() => {
          result = hal.disconnect(unconnectedPinName);
        }).not.toThrow();

        expect(result).toBe(true);

        // Verify it's still not connected
        const pinInfo = hal
          .getInfoPins()
          .find((p) => p.name === unconnectedPinName);
        expect(pinInfo).toBeDefined();
        expect(pinInfo?.signalName).toBeUndefined();
      });
    });

    describe("pinHasWriter()", () => {
      const writerSig = uniqueName("writer-sig");
      const noWriterSig = uniqueName("no-writer-sig");
      const compC_name = uniqueName("compC");
      const compC = new hal.HalComponent(compC_name);
      const cPinIn = `${compC_name}.in`;
      const cPinOut = `${compC_name}.out`;
      compC.newPin("in", "bit", "in");
      compC.newPin("out", "bit", "out");
      compC.ready();

      beforeAll(() => {
        hal.newSignal(writerSig, "bit");
        hal.newSignal(noWriterSig, "bit");
        hal.connect(cPinOut, writerSig);
      });

      it("should return true for IN pin connected to signal with a writer", () => {
        hal.connect(cPinIn, writerSig);
        expect(hal.pinHasWriter(cPinIn)).toBe(true);
        hal.disconnect(cPinIn);
      });

      it("should return false for IN pin connected to signal with no writer", () => {
        hal.connect(cPinIn, noWriterSig);
        expect(hal.pinHasWriter(cPinIn)).toBe(false);
        hal.disconnect(cPinIn);
      });

      it("should return false for unconnected IN pin", () => {
        try {
          hal.disconnect(cPinIn);
        } catch (e) {}
        expect(hal.pinHasWriter(cPinIn)).toBe(false);
      });

      it("should return true for OUT pin if connected to signal with a writer (itself)", () => {
        expect(hal.pinHasWriter(cPinOut)).toBe(true);
      });

      it("should throw HalError for non-existent pin", async () => {
        await expectHalError(
          () => hal.pinHasWriter(uniqueName("non-pin")),
          /Pin .* does not exist/
        );
      });
    });

    describe("getValue()", () => {
      const sigForGetValue = uniqueName("sig-gv");
      beforeAll(() => {
        // reset from previous tests
        hal.setPinParamValue(`${compB_name}.in.float`, 0.0);

        hal.newSignal(sigForGetValue, "float");
        compA.setValue("out.float", 98.76);
        hal.connect(`${compA_name}.out.float`, sigForGetValue);

        compA.setValue("param.s32.rw", -12345);
      });

      it("should get value of a pin", () => {
        expect(hal.getValue(`${compA_name}.out.float`)).toBeCloseTo(98.76);
        expect(hal.getValue(`${compB_name}.in.float`)).toBe(0.0);
      });

      it("should get value of a param", () => {
        expect(hal.getValue(`${compA_name}.param.s32.rw`)).toBe(-12345);
      });

      it("should get value of a signal", () => {
        expect(hal.getValue(sigForGetValue)).toBeCloseTo(98.76);
      });

      it("should throw HalError if item not found", async () => {
        await expectHalError(
          () => hal.getValue(uniqueName("non-item-gv")),
          /not found/
        );
      });
    });

    describe("getInfoPins(), getInfoSignals(), getInfoParams()", () => {
      const infoCompName = uniqueName("info-comp");
      const infoComp = new hal.HalComponent(infoCompName);
      const pName = `${infoCompName}.p.info`;
      const parName = `${infoCompName}.par.info`;
      const sigName = uniqueName("sig.info");

      beforeAll(() => {
        infoComp.newPin("p.info", "u32", "io");
        infoComp.newParam("par.info", "s64", "rw");
        infoComp.ready();
        hal.newSignal(sigName, "u32");
        hal.connect(pName, sigName);
        infoComp.setValue("p.info", 123);
        infoComp.setValue("par.info", 100);
      });

      it("getInfoPins() should return list containing known pin", () => {
        const pins = hal.getInfoPins();
        expect(Array.isArray(pins)).toBe(true);
        const foundPin = pins.find((p) => p.name === pName);
        expect(foundPin).toBeDefined();
        expect(foundPin?.type).toBe("u32");
        expect(foundPin?.direction).toBe("io");
        expect(foundPin?.value).toBe(123);
        expect(foundPin?.signalName).toBe(sigName);

        const compInternal = infoComp as any;
        if (
          compInternal.nativeInstance &&
          typeof compInternal.nativeInstance.hal_id_ !== "undefined"
        ) {
          expect(foundPin?.ownerId).toBe(compInternal.nativeInstance.hal_id_);
        } else {
          console.warn(
            "Skipping ownerId check for pin in getInfoPins test due to inaccessible hal_id_"
          );
        }
      });

      it("getInfoSignals() should return list containing known signal", () => {
        const signals = hal.getInfoSignals();
        expect(Array.isArray(signals)).toBe(true);
        const foundSignal = signals.find((s) => s.name === sigName);
        expect(foundSignal).toBeDefined();
        expect(foundSignal?.type).toBe("u32");
        expect(foundSignal?.value).toBe(123);
        expect(foundSignal?.writers).toBe(0);
        expect(foundSignal?.bidirs).toBe(1);
        expect(foundSignal?.driver).toBe(pName);
      });

      it("getInfoParams() should return list containing known param", () => {
        const params = hal.getInfoParams();
        expect(Array.isArray(params)).toBe(true);
        const foundParam = params.find((p) => p.name === parName);
        expect(foundParam).toBeDefined();
        expect(foundParam?.type).toBe("s64");
        expect(foundParam?.direction).toBe("rw");
        expect(foundParam?.value).toBe(100);
        const compInternal = infoComp as any;
        if (
          compInternal.nativeInstance &&
          typeof compInternal.nativeInstance.hal_id_ !== "undefined"
        ) {
          expect(foundParam?.ownerId).toBe(compInternal.nativeInstance.hal_id_);
        } else {
          console.warn(
            "Skipping ownerId check for param in getInfoParams test due to inaccessible hal_id_"
          );
        }
      });
    });

    describe("setPinParamValue()", () => {
      const setpCompName = uniqueName("setp-comp");
      const setpComp = new hal.HalComponent(setpCompName);
      const unconnectedInPin = `${setpCompName}.unconn.in.bit`;
      const unconnectedOutPin = `${setpCompName}.unconn.out.bit`;
      const rwParam = `${setpCompName}.rw.param.float`;
      beforeAll(() => {
        setpComp.newPin("unconn.in.bit", "bit", "in");
        setpComp.newPin("unconn.out.bit", "bit", "out");
        setpComp.newParam("rw.param.float", "float", "rw");
        setpComp.ready();
      });

      it("should set value of unconnected IN pin", () => {
        expect(hal.setPinParamValue(unconnectedInPin, true)).toBe(true);
        expect(hal.getValue(unconnectedInPin)).toBe(true);
        expect(hal.setPinParamValue(unconnectedInPin, "false")).toBe(true);
        expect(hal.getValue(unconnectedInPin)).toBe(false);
      });

      it("should set value of RW param", () => {
        expect(hal.setPinParamValue(rwParam, 123.789)).toBe(true);
        expect(hal.getValue(rwParam)).toBeCloseTo(123.789);
        expect(hal.setPinParamValue(rwParam, "-0.5")).toBe(true);
        expect(hal.getValue(rwParam)).toBeCloseTo(-0.5);
      });

      it("should throw HalError for OUT pin", async () => {
        await expectHalError(
          () => hal.setPinParamValue(unconnectedOutPin, true),
          /Pin .* is an OUT pin/
        );
      });

      it("should throw HalError for connected IN pin", async () => {
        const connectedInPin = `${compA_name}.in.bit`;
        const tempSigSetP = uniqueName("temp-sig-setp");
        hal.newSignal(tempSigSetP, "bit");
        hal.connect(connectedInPin, tempSigSetP);

        await expectHalError(
          () => hal.setPinParamValue(connectedInPin, true),
          /Pin .* is connected to a signal/
        );
        hal.disconnect(connectedInPin);
      });

      it("should throw HalError if item not found", async () => {
        await expectHalError(
          () => hal.setPinParamValue(uniqueName("non-item-setp"), true),
          /Pin\/param .* not found/
        );
      });

      it("should throw HalError for invalid value string for type", async () => {
        await expectHalError(
          () => hal.setPinParamValue(rwParam, "not-a-float"),
          /Failed to set pin\/param/
        );
      });
    });

    describe("setSignalValue()", () => {
      const sigSetS_unconn = uniqueName("sig-sets-unconn");
      const sigSetS_conn = uniqueName("sig-sets-conn");

      beforeAll(() => {
        hal.newSignal(sigSetS_unconn, "s32");
        hal.newSignal(sigSetS_conn, "bit");
        hal.connect(`${compB_name}.out.bit`, sigSetS_conn);
      });

      it("should set value of an unconnected signal", () => {
        expect(hal.setSignalValue(sigSetS_unconn, -999)).toBe(true);
        expect(hal.getValue(sigSetS_unconn)).toBe(-999);
        expect(hal.setSignalValue(sigSetS_unconn, "12345")).toBe(true);
        expect(hal.getValue(sigSetS_unconn)).toBe(12345);
      });

      it("should throw HalError if signal has a writer", async () => {
        await expectHalError(
          () => hal.setSignalValue(sigSetS_conn, true),
          /Signal .* already has writer\(s\)/
        );
      });

      it("should throw HalError if signal not found", async () => {
        await expectHalError(
          () => hal.setSignalValue(uniqueName("non-sig-sets"), true),
          /Signal .* not found/
        );
      });

      it("should throw HalError for invalid value string for type", async () => {
        await expectHalError(
          () => hal.setSignalValue(sigSetS_unconn, "not-an-s32"),
          /Failed to set signal/
        );
      });
    });
  });
});
