import * as hal from "../src/ts/index";
import { DEFAULT_POLL_INTERVAL, HalMonitorOptions } from "../src/ts/component";
import { Pin, Param } from "../src/ts/item";

// Helper for unique names to avoid HAL conflicts between tests
let nameCounter = 0;
const uniqueName = (base: string): string => {
  const sanitizedBase = base.replace(/[^a-zA-Z0-9\-_.]/g, "_").substring(0, 8);
  return `${sanitizedBase}-${nameCounter++}`;
};

// Helper to wait for a specific amount of time
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Helper to wait for callback execution with timeout
const waitForCondition = async (
  condition: () => boolean,
  timeoutMs: number = 2000,
  intervalMs: number = 10
): Promise<void> => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (condition()) {
      return;
    }
    await wait(intervalMs);
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
};

jest.setTimeout(15000);

describe("HAL Monitoring System Tests", () => {
  let compName: string;
  let comp: hal.HalComponent;

  beforeEach(() => {
    compName = uniqueName("mon-test");
    comp = new hal.HalComponent(compName);
  });

  afterEach(() => {
    if (comp) {
      comp.dispose();
    }
  });

  describe("Monitoring Configuration", () => {
    it("should have default monitoring options", () => {
      const options = comp.getMonitoringOptions();
      expect(options).toEqual({ pollInterval: DEFAULT_POLL_INTERVAL });
    });

    it("should allow setting monitoring options", () => {
      const newOptions: HalMonitorOptions = { pollInterval: 50 };
      comp.setMonitoringOptions(newOptions);

      const options = comp.getMonitoringOptions();
      expect(options.pollInterval).toBe(50);
    });
  });

  describe("Pin Monitoring", () => {
    let pin: Pin;

    beforeEach(() => {
      pin = comp.newPin("test-pin", "bit", "out");
      comp.ready();
    });

    it("should emit 'change' event when pin value changes", async () => {
      let callbackExecuted = false;
      let newValue: number | boolean | undefined;
      let oldValue: number | boolean | undefined;

      pin.on("change", (nVal, oVal) => {
        callbackExecuted = true;
        newValue = nVal;
        oldValue = oVal;
      });
      // Change pin value
      comp.setValue("test-pin", true);

      // Wait for callback to be executed
      await waitForCondition(() => callbackExecuted);

      expect(callbackExecuted).toBe(true);
      expect(newValue).toBe(true);
      expect(oldValue).toBe(false); // Default initial value for HAL_BIT
    });

    it("should detect multiple value changes", async () => {
      const history: Array<{
        newValue: number | boolean;
        oldValue: number | boolean;
      }> = [];

      const callback = (nVal: number | boolean, oVal: number | boolean) => {
        history.push({ newValue: nVal, oldValue: oVal });
      };

      pin.on("change", callback);

      // Make multiple changes
      comp.setValue("test-pin", true);
      await waitForCondition(() => history.length >= 1);

      comp.setValue("test-pin", false);
      await waitForCondition(() => history.length >= 2);

      comp.setValue("test-pin", true);
      await waitForCondition(() => history.length >= 3);

      expect(history).toHaveLength(3);
      expect(history[0]).toEqual({ newValue: true, oldValue: false });
      expect(history[1]).toEqual({ newValue: false, oldValue: true });
      expect(history[2]).toEqual({ newValue: true, oldValue: false });
    });

    it("should support multiple listeners for the same pin", async () => {
      let callback1Executed = false;
      let callback2Executed = false;

      const callback1 = () => {
        callback1Executed = true;
      };

      const callback2 = () => {
        callback2Executed = true;
      };

      pin.on("change", callback1);
      pin.on("change", callback2);

      comp.setValue("test-pin", true);

      await waitForCondition(() => callback1Executed && callback2Executed);

      expect(callback1Executed).toBe(true);
      expect(callback2Executed).toBe(true);
    });

    it("should stop receiving updates after removing listener", async () => {
      let callbackExecuted = false;

      const callback = () => {
        callbackExecuted = true;
      };

      pin.on("change", callback);
      pin.off("change", callback);

      comp.setValue("test-pin", true);

      // Wait a bit to ensure no callback is fired
      await wait(100);

      expect(callbackExecuted).toBe(false);
    });

    it("should handle HAL_FLOAT pin monitoring", async () => {
      comp.unready(); // Need to add more pins
      const floatPin = comp.newPin("flt-pin", "float", "out");
      comp.ready();

      let callbackExecuted = false;
      let receivedValue: number | boolean | undefined;

      const callback = (newVal: number | boolean) => {
        callbackExecuted = true;
        receivedValue = newVal;
      };

      floatPin.on("change", callback);
      comp.setValue("flt-pin", 3.14159);

      await waitForCondition(() => callbackExecuted);

      expect(receivedValue).toBeCloseTo(3.14159);
    });

    it("should handle HAL_S32 pin monitoring", async () => {
      comp.unready();
      const s32Pin = comp.newPin("s32-pin", "s32", "out");
      comp.ready();

      let callbackExecuted = false;
      let receivedValue: number | boolean | undefined;

      const callback = (newVal: number | boolean) => {
        callbackExecuted = true;
        receivedValue = newVal;
      };

      s32Pin.on("change", callback);
      comp.setValue("s32-pin", -12345);

      await waitForCondition(() => callbackExecuted);

      expect(receivedValue).toBe(-12345);
    });
  });

  describe("Parameter Monitoring", () => {
    let param: Param;

    beforeEach(() => {
      param = comp.newParam("test-param", "bit", "rw");
      comp.ready();
    });

    it("should allow watching parameter value changes", async () => {
      let callbackExecuted = false;
      let newValue: number | boolean | undefined;
      let oldValue: number | boolean | undefined;

      const callback = (nVal: number | boolean, oVal: number | boolean) => {
        callbackExecuted = true;
        newValue = nVal;
        oldValue = oVal;
      };

      param.on("change", callback);
      comp.setValue("test-param", true);

      await waitForCondition(() => callbackExecuted);

      expect(callbackExecuted).toBe(true);
      expect(newValue).toBe(true);
      expect(oldValue).toBe(false);
    });

    it("should monitor HAL_FLOAT parameters", async () => {
      comp.unready();
      const floatParam = comp.newParam("float-param", "float", "rw");
      comp.ready();

      let callbackExecuted = false;
      let receivedValue: number | boolean | undefined;

      const callback = (newVal: number | boolean) => {
        callbackExecuted = true;
        receivedValue = newVal;
      };

      floatParam.on("change", callback);
      comp.setValue("float-param", 2.71828);

      await waitForCondition(() => callbackExecuted);

      expect(receivedValue).toBeCloseTo(2.71828);
    });
  });

  describe("Integration with Methods", () => {
    it("should work when setting value via Pin.setValue()", async () => {
      const pin = comp.newPin("method-test-pin", "s32", "out");
      comp.ready();

      let callbackExecuted = false;
      let receivedValue: number | boolean | undefined;

      const callback = (newVal: number | boolean) => {
        callbackExecuted = true;
        receivedValue = newVal;
      };

      pin.on("change", callback);

      // Use method to set value
      pin.setValue(12345);

      await waitForCondition(() => callbackExecuted);

      expect(receivedValue).toBe(12345);
      expect(pin.getValue()).toBe(12345);
    });
  });
});
