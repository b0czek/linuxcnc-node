import * as hal from "../src/ts/index";
import {
  HalType,
  HalPinDir,
  HalParamDir,
  RtapiMsgLevel,
} from "../src/ts/enums";
import {
  HalComponentInstance,
  HalComponent as HalComponentClass,
} from "../src/ts/component";

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

    if (!isHalError && !isTypeError) {
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
    let comp: HalComponentInstance;

    beforeEach(() => {
      compName = uniqueName("hc-test");
      comp = hal.component(compName);
      expect(hal.componentExists(compName)).toBe(true);
    });

    it("should have correct name and prefix upon creation", () => {
      expect(comp.name).toBe(compName);
      expect(comp.prefix).toBe(compName); // Default prefix
    });

    it("should use custom prefix if provided", () => {
      const customPrefix = uniqueName("custom-prefix");
      const compWithPrefix = hal.component(
        uniqueName("comp-with-prefix"),
        customPrefix
      );
      expect(compWithPrefix.prefix).toBe(customPrefix);
    });

    describe("newPin()", () => {
      it("should create HAL_BIT pins (IN, OUT, IO)", () => {
        const pinIn = comp.newPin("bit.in", hal.HAL_BIT, hal.HAL_IN);
        expect(pinIn.name).toBe("bit.in");
        expect(pinIn.type).toBe(hal.HAL_BIT);
        expect(pinIn.direction).toBe(hal.HAL_IN);
        expect(comp.getPins()["bit.in"]).toBe(pinIn);

        const pinOut = comp.newPin("bit.out", hal.HAL_BIT, hal.HAL_OUT);
        expect(pinOut.direction).toBe(hal.HAL_OUT);
        expect(comp.getPins()["bit.out"]).toBe(pinOut);

        const pinIo = comp.newPin("bit.io", hal.HAL_BIT, hal.HAL_IO);
        expect(pinIo.direction).toBe(hal.HAL_IO);
        expect(comp.getPins()["bit.io"]).toBe(pinIo);
      });

      it("should create HAL_FLOAT pins", () => {
        const pinFloatOut = comp.newPin(
          "float.out",
          hal.HAL_FLOAT,
          hal.HAL_OUT
        );
        expect(pinFloatOut.type).toBe(hal.HAL_FLOAT);
      });

      it("should create HAL_S32 pins", () => {
        const pinS32In = comp.newPin("s32.in", hal.HAL_S32, hal.HAL_IN);
        expect(pinS32In.type).toBe(hal.HAL_S32);
      });

      it("should create HAL_U32 pins", () => {
        const pinU32Io = comp.newPin("u32.io", hal.HAL_U32, hal.HAL_IO);
        expect(pinU32Io.type).toBe(hal.HAL_U32);
      });

      it("should throw error if component is ready", () => {
        comp.ready();
        expect(() =>
          comp.newPin("after.ready", hal.HAL_BIT, hal.HAL_IN)
        ).toThrow(/Cannot add items after component is ready/);
      });

      it("should throw error for duplicate pin name_suffix", () => {
        comp.newPin("dup.pin", hal.HAL_BIT, hal.HAL_IN);
        expect(() =>
          comp.newPin("dup.pin", hal.HAL_FLOAT, hal.HAL_OUT)
        ).toThrow(/Duplicate item name_suffix 'dup.pin'/);
      });

      it("should throw TypeError for invalid arguments from C++ N-API checks", () => {
        const expectedErrorMessage =
          "Expected: name_suffix (string), type (HalType), direction (HalPinDir/HalParamDir)";

        expect(() =>
          (comp as any).newPin(123, hal.HAL_BIT, hal.HAL_IN)
        ).toThrowError(expectedErrorMessage);

        // For the other cases, if they also hit this C++ check:
        expect(() =>
          comp.newPin("invalid.type", "invalid" as any, hal.HAL_IN)
        ).toThrowError(expectedErrorMessage);

        expect(() =>
          comp.newPin("invalid.dir", hal.HAL_BIT, "invalid" as any)
        ).toThrowError(expectedErrorMessage);
      });
    });

    describe("newParam()", () => {
      it("should create HAL_BIT params (RO, RW)", () => {
        const paramRo = comp.newParam("bit.ro", hal.HAL_BIT, hal.HAL_RO);
        expect(paramRo.name).toBe("bit.ro");
        expect(paramRo.type).toBe(hal.HAL_BIT);
        expect(paramRo.direction).toBe(hal.HAL_RO);
        expect(comp.getParams()["bit.ro"]).toBe(paramRo);

        const paramRw = comp.newParam("bit.rw", hal.HAL_BIT, hal.HAL_RW);
        expect(paramRw.direction).toBe(hal.HAL_RW);
        expect(comp.getParams()["bit.rw"]).toBe(paramRw);
      });

      it("should create HAL_FLOAT params", () => {
        const paramFloatRw = comp.newParam(
          "float.rw",
          hal.HAL_FLOAT,
          hal.HAL_RW
        );
        expect(paramFloatRw.type).toBe(hal.HAL_FLOAT);
      });

      it("should throw error if component is ready", () => {
        comp.ready();
        expect(() =>
          comp.newParam("after.ready", hal.HAL_BIT, hal.HAL_RO)
        ).toThrow(/Cannot add items after component is ready/);
      });

      it("should throw error for duplicate param name_suffix", () => {
        comp.newParam("dup.param", hal.HAL_BIT, hal.HAL_RO);
        expect(() =>
          comp.newParam("dup.param", hal.HAL_FLOAT, hal.HAL_RW)
        ).toThrow(/Duplicate item name_suffix 'dup.param'/);
      });
    });

    describe("ready()", () => {
      it("should set component to ready state", () => {
        expect(hal.componentIsReady(compName)).toBe(false);
        comp.ready();
        expect(hal.componentIsReady(compName)).toBe(true);
      });

      it("ready() should throw HalError if called on an already ready component", async () => {
        comp.ready();
        expect(hal.componentIsReady(compName)).toBe(true);

        await expectHalError(
          () => comp.ready(),
          /hal_ready failed|already ready/i
        );
        expect(hal.componentIsReady(compName)).toBe(true); // State should remain ready
      });
    });

    describe("getPins() and getParams()", () => {
      it("should return a map of created pins", () => {
        const p1 = comp.newPin("pin1", hal.HAL_BIT, hal.HAL_IN);
        const p2 = comp.newPin("pin2", hal.HAL_FLOAT, hal.HAL_OUT);
        const pins = comp.getPins();
        expect(Object.keys(pins).length).toBe(2);
        expect(pins["pin1"]).toBe(p1);
        expect(pins["pin2"]).toBe(p2);
      });

      it("should return a map of created params", () => {
        const param1 = comp.newParam("param1", hal.HAL_S32, hal.HAL_RO);
        const param2 = comp.newParam("param2", hal.HAL_U32, hal.HAL_RW);
        const params = comp.getParams();
        expect(Object.keys(params).length).toBe(2);
        expect(params["param1"]).toBe(param1);
        expect(params["param2"]).toBe(param2);
      });
    });

    describe("Proxy Access (get/set)", () => {
      beforeEach(() => {
        // Pins
        comp.newPin("p.bit.in", hal.HAL_BIT, hal.HAL_IN);
        comp.newPin("p.bit.out", hal.HAL_BIT, hal.HAL_OUT);
        comp.newPin("p.bit.io", hal.HAL_BIT, hal.HAL_IO);
        comp.newPin("p.float.out", hal.HAL_FLOAT, hal.HAL_OUT);
        comp.newPin("p.s32.out", hal.HAL_S32, hal.HAL_OUT);
        comp.newPin("p.u32.out", hal.HAL_U32, hal.HAL_OUT);

        // Params
        comp.newParam("par.bit.ro", hal.HAL_BIT, hal.HAL_RO);
        comp.newParam("par.bit.rw", hal.HAL_BIT, hal.HAL_RW);
        comp.newParam("par.float.rw", hal.HAL_FLOAT, hal.HAL_RW);
        comp.newParam("par.s32.rw", hal.HAL_S32, hal.HAL_RW);

        comp.ready();
      });

      it("should get default values (typically 0 or false)", () => {
        expect(comp["p.bit.out"]).toBe(false);
        expect(comp["p.float.out"]).toBe(0.0);
        expect(comp["p.s32.out"]).toBe(0);
        expect(comp["par.bit.rw"]).toBe(false);
      });

      it("should set and get HAL_BIT values", () => {
        comp["p.bit.out"] = true;
        expect(comp["p.bit.out"]).toBe(true);
        comp["p.bit.io"] = false;
        expect(comp["p.bit.io"]).toBe(false);
        comp["par.bit.rw"] = true;
        expect(comp["par.bit.rw"]).toBe(true);
      });

      it("should set and get HAL_FLOAT values", () => {
        comp["p.float.out"] = 123.456;
        expect(comp["p.float.out"] as number).toBeCloseTo(123.456);
        comp["par.float.rw"] = -0.5;
        expect(comp["par.float.rw"] as number).toBeCloseTo(-0.5);
      });

      it("should set and get HAL_S32 values", () => {
        comp["p.s32.out"] = -1000;
        expect(comp["p.s32.out"]).toBe(-1000);
        comp["par.s32.rw"] = 2000;
        expect(comp["par.s32.rw"]).toBe(2000);
      });

      it("should set and get HAL_U32 values", () => {
        comp["p.u32.out"] = 4000000000;
        expect(comp["p.u32.out"]).toBe(4000000000);
      });

      it("should throw HalError when setting an IN pin", async () => {
        await expectHalError(() => {
          comp["p.bit.in"] = true;
        }, /Cannot set value of an IN pin/);
      });

      it("should throw HalError for non-existent property", async () => {
        await expectHalError(
          () => comp["non.existent.pin"],
          /not found on component/
        );
        await expectHalError(() => {
          comp["non.existent.pin"] = 1;
        }, /not found on component/);
      });

      it("should reject non-boolean/non-number values on set via proxy (TS layer check)", () => {
        const consoleErrorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => {});

        // The assignment itself will throw the TypeError because the proxy's set trap returns false.
        expect(() => {
          comp["p.bit.out"] = "somestring" as any;
        }).toThrow(TypeError); // Or more specifically: .toThrowError(/trap returned falsish for property 'p.bit.out'/);

        // Verify the console.error was called before the TypeError was thrown by the engine
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "HAL item 'p.bit.out' can only be set to a number or boolean. Received type string."
          )
        );

        // Check that the value didn't actually change due to the guard and subsequent error
        const originalValue = comp["p.bit.out"];

        // Try the invalid assignment again, wrapped to catch the expected TypeError
        try {
          comp["p.bit.out"] = "test" as any;
        } catch (e: any) {
          expect(e).toBeInstanceOf(TypeError);
        }
        expect(comp["p.bit.out"]).toBe(originalValue); // Should remain unchanged

        consoleErrorSpy.mockRestore();
      });
    });
  });

  describe("Pin Class (via HalComponent)", () => {
    let comp: HalComponentInstance;
    let pinOut: hal.Pin;
    let pinIn: hal.Pin;

    beforeEach(() => {
      comp = hal.component(uniqueName("pin-class-comp"));
      pinOut = comp.newPin("p.out", hal.HAL_FLOAT, hal.HAL_OUT);
      pinIn = comp.newPin("p.in", hal.HAL_BIT, hal.HAL_IN);
      comp.ready();
    });

    it("Pin.getValue() should retrieve value", () => {
      comp["p.out"] = 78.9;
      expect(pinOut.getValue()).toBeCloseTo(78.9);
      expect(pinIn.getValue()).toBe(false);
    });

    it("Pin.setValue() should set value for OUT/IO pins", () => {
      pinOut.setValue(101.1);
      expect(comp["p.out"] as number).toBeCloseTo(101.1);
    });

    it("Pin.setValue() should throw HalError for IN pins", async () => {
      await expectHalError(
        () => pinIn.setValue(true),
        /Cannot set value of an IN pin/
      );
    });

    it("Pin properties should be correct", () => {
      expect(pinOut.name).toBe("p.out");
      expect(pinOut.type).toBe(hal.HAL_FLOAT);
      expect(pinOut.direction).toBe(hal.HAL_OUT);
    });
  });

  describe("Param Class (via HalComponent)", () => {
    let comp: HalComponentInstance;
    let paramRw: hal.Param;
    let paramRo: hal.Param;

    beforeEach(() => {
      comp = hal.component(uniqueName("param-class-comp"));
      paramRw = comp.newParam("par.rw", hal.HAL_S32, hal.HAL_RW);
      paramRo = comp.newParam("par.ro", hal.HAL_BIT, hal.HAL_RO);
      comp.ready();
    });

    it("Param.getValue() should retrieve value", () => {
      comp["par.rw"] = -500;
      expect(paramRw.getValue()).toBe(-500);
      expect(paramRo.getValue()).toBe(false);
    });

    it("Param.setValue() should set value for RW params", () => {
      paramRw.setValue(999);
      expect(comp["par.rw"]).toBe(999);
    });

    it("Param properties should be correct", () => {
      expect(paramRw.name).toBe("par.rw");
      expect(paramRw.type).toBe(hal.HAL_S32);
      expect(paramRw.direction).toBe(hal.HAL_RW);
    });
  });
});
