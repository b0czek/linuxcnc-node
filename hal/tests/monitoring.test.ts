import * as hal from "../src/ts/index";
import {
  DEFAULT_POLL_INTERVAL,
  HalMonitorOptions,
  HalDelta,
} from "../src/ts/component";
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

  describe("Delta/Batch Updates", () => {
    let pin1: Pin;
    let pin2: Pin;

    beforeEach(() => {
      pin1 = comp.newPin("delta-pin1", "float", "out");
      pin2 = comp.newPin("delta-pin2", "s32", "out");
      comp.ready();
    });

    it("should have cursor start at 0", () => {
      expect(comp.getCursor()).toBe(0);
    });

    it("should emit 'delta' event when values change", async () => {
      let deltaReceived: HalDelta | null = null;

      // Need to attach change listeners to start monitoring
      pin1.on("change", () => {});

      comp.on("delta", (delta) => {
        deltaReceived = delta;
      });

      comp.setValue("delta-pin1", 3.14);

      await waitForCondition(() => deltaReceived !== null);

      expect(deltaReceived).not.toBeNull();
      expect(deltaReceived!.changes).toHaveLength(1);
      expect(deltaReceived!.changes[0].name).toBe("delta-pin1");
      expect(deltaReceived!.changes[0].value).toBeCloseTo(3.14);
      expect(deltaReceived!.cursor).toBe(1);
      expect(deltaReceived!.timestamp).toBeGreaterThan(0);
    });

    it("should increment cursor with each delta emit", async () => {
      const deltas: HalDelta[] = [];

      pin1.on("change", () => {});

      comp.on("delta", (delta) => {
        deltas.push(delta);
      });

      comp.setValue("delta-pin1", 1.0);
      await waitForCondition(() => deltas.length >= 1);

      comp.setValue("delta-pin1", 2.0);
      await waitForCondition(() => deltas.length >= 2);

      comp.setValue("delta-pin1", 3.0);
      await waitForCondition(() => deltas.length >= 3);

      expect(deltas[0].cursor).toBe(1);
      expect(deltas[1].cursor).toBe(2);
      expect(deltas[2].cursor).toBe(3);
      expect(comp.getCursor()).toBe(3);
    });

    it("should batch multiple changes in same poll cycle into one delta", async () => {
      const deltas: HalDelta[] = [];

      // Watch both pins
      pin1.on("change", () => {});
      pin2.on("change", () => {});

      comp.on("delta", (delta) => {
        deltas.push(delta);
      });

      // Change both pins before poll cycle triggers
      comp.setValue("delta-pin1", 100.5);
      comp.setValue("delta-pin2", 42);

      // Wait for a delta with both changes
      await waitForCondition(() => deltas.some((d) => d.changes.length === 2));

      const batchedDelta = deltas.find((d) => d.changes.length === 2);
      expect(batchedDelta).toBeDefined();
      expect(batchedDelta!.changes).toContainEqual({
        name: "delta-pin1",
        value: expect.closeTo(100.5, 5),
      });
      expect(batchedDelta!.changes).toContainEqual({
        name: "delta-pin2",
        value: 42,
      });
    });

    it("should not emit delta if no values changed", async () => {
      let deltaCount = 0;

      pin1.on("change", () => {});
      comp.on("delta", () => {
        deltaCount++;
      });

      // Set value to trigger first delta
      comp.setValue("delta-pin1", 1.0);
      await waitForCondition(() => deltaCount >= 1);

      const countAfterFirstChange = deltaCount;

      // Wait for several poll cycles without changing value
      await wait(100);

      expect(deltaCount).toBe(countAfterFirstChange);
    });

    it("should return correct snapshot", async () => {
      // Watch pins to include them in snapshot
      pin1.on("change", () => {});
      pin2.on("change", () => {});

      // Set some values
      comp.setValue("delta-pin1", 99.9);
      comp.setValue("delta-pin2", 123);

      // Wait for changes to be processed
      await waitForCondition(() => comp.getCursor() >= 1);

      const snapshot = comp.getSnapshot();

      expect(snapshot.items).toHaveProperty("delta-pin1");
      expect(snapshot.items).toHaveProperty("delta-pin2");
      expect(snapshot.items["delta-pin1"]).toBeCloseTo(99.9);
      expect(snapshot.items["delta-pin2"]).toBe(123);
      expect(snapshot.cursor).toBe(comp.getCursor());
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });

    it("should have delta timestamp be reasonable", async () => {
      let deltaReceived: HalDelta | null = null;
      const beforeTime = Date.now();

      pin1.on("change", () => {});
      comp.on("delta", (delta) => {
        deltaReceived = delta;
      });

      comp.setValue("delta-pin1", 1.0);
      await waitForCondition(() => deltaReceived !== null);

      const afterTime = Date.now();

      expect(deltaReceived!.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(deltaReceived!.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });
});
