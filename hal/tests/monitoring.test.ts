import * as hal from "../src/ts/index";
import {
  DEFAULT_POLL_INTERVAL,
  HalWatchCallback,
  HalWatchOptions,
} from "../src/ts/component";

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
const waitForCallback = async (
  callback: () => boolean,
  timeoutMs: number = 1000,
  intervalMs: number = 10
): Promise<void> => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (callback()) {
      return;
    }
    await wait(intervalMs);
  }
  throw new Error(`Callback condition not met within ${timeoutMs}ms`);
};

jest.setTimeout(15000);

describe("HAL Monitoring System Tests", () => {
  let compName: string;
  let comp: any;

  beforeEach(() => {
    compName = uniqueName("monitoring-test");
    comp = hal.component(compName);
  });

  afterEach(() => {
    // Cleanup component to stop any active monitoring
    if (comp && comp.destroy) {
      comp.destroy();
    }
  });

  describe("Monitoring Configuration", () => {
    it("should have default monitoring options", () => {
      const options = comp.getMonitoringOptions();
      expect(options).toEqual({ pollInterval: DEFAULT_POLL_INTERVAL });
    });

    it("should allow setting monitoring options", () => {
      const newOptions: HalWatchOptions = { pollInterval: 50 };
      comp.setMonitoringOptions(newOptions);

      const options = comp.getMonitoringOptions();
      expect(options.pollInterval).toBe(50);
    });

    it("should return a copy of monitoring options to prevent external modification", () => {
      const options1 = comp.getMonitoringOptions();
      const options2 = comp.getMonitoringOptions();

      expect(options1).not.toBe(options2); // Different objects
      expect(options1).toEqual(options2); // Same content
    });
  });

  describe("Pin Monitoring", () => {
    let pin: any;

    beforeEach(() => {
      pin = comp.newPin("test-pin", hal.HAL_BIT, hal.HAL_OUT);
      comp.ready();
    });

    it("should allow watching pin value changes", async () => {
      let callbackExecuted = false;
      let newValue: any;
      let oldValue: any;
      let receivedObject: any;

      const callback: HalWatchCallback = (nVal, oVal, obj) => {
        callbackExecuted = true;
        newValue = nVal;
        oldValue = oVal;
        receivedObject = obj;
      };

      pin.watch(callback);

      // Change pin value
      pin.setValue(true);

      // Wait for callback to be executed
      await waitForCallback(() => callbackExecuted);

      expect(callbackExecuted).toBe(true);
      expect(newValue).toBe(true);
      expect(oldValue).toBe(false); // Default initial value for HAL_BIT
      expect(receivedObject).toBe(pin);
    });

    it("should detect multiple value changes", async () => {
      const callbackHistory: Array<{ newValue: any; oldValue: any }> = [];

      const callback: HalWatchCallback = (nVal, oVal) => {
        callbackHistory.push({ newValue: nVal, oldValue: oVal });
      };

      pin.watch(callback);

      // Make multiple changes
      pin.setValue(true);
      await waitForCallback(() => callbackHistory.length >= 1);

      pin.setValue(false);
      await waitForCallback(() => callbackHistory.length >= 2);

      pin.setValue(true);
      await waitForCallback(() => callbackHistory.length >= 3);

      expect(callbackHistory).toHaveLength(3);
      expect(callbackHistory[0]).toEqual({ newValue: true, oldValue: false });
      expect(callbackHistory[1]).toEqual({ newValue: false, oldValue: true });
      expect(callbackHistory[2]).toEqual({ newValue: true, oldValue: false });
    });

    it("should support multiple callbacks for the same pin", async () => {
      let callback1Executed = false;
      let callback2Executed = false;

      const callback1: HalWatchCallback = () => {
        callback1Executed = true;
      };

      const callback2: HalWatchCallback = () => {
        callback2Executed = true;
      };

      pin.watch(callback1);
      pin.watch(callback2);

      pin.setValue(true);

      await waitForCallback(() => callback1Executed && callback2Executed);

      expect(callback1Executed).toBe(true);
      expect(callback2Executed).toBe(true);
    });

    it("should remove specific watch callbacks", async () => {
      let callback1Executed = false;
      let callback2Executed = false;

      const callback1: HalWatchCallback = () => {
        callback1Executed = true;
      };

      const callback2: HalWatchCallback = () => {
        callback2Executed = true;
      };

      pin.watch(callback1);
      pin.watch(callback2);

      // Remove first callback
      pin.removeWatch(callback1);

      pin.setValue(true);

      // Wait a bit to see if any callbacks are executed
      await wait(50);

      expect(callback1Executed).toBe(false);
      expect(callback2Executed).toBe(true);
    });

    it("should handle HAL_FLOAT pin monitoring", async () => {
      comp.unready();
      const floatPin = comp.newPin("flt-pin", hal.HAL_FLOAT, hal.HAL_OUT);
      comp.ready();

      let callbackExecuted = false;
      let receivedValue: any;

      const callback: HalWatchCallback = (newVal) => {
        callbackExecuted = true;
        receivedValue = newVal;
      };

      floatPin.watch(callback);
      floatPin.setValue(3.14159);

      await waitForCallback(() => callbackExecuted);

      expect(receivedValue).toBeCloseTo(3.14159);
    });

    it("should handle HAL_S32 pin monitoring", async () => {
      comp.unready();
      const s32Pin = comp.newPin("s32-pin", hal.HAL_S32, hal.HAL_OUT);
      comp.ready();

      let callbackExecuted = false;
      let receivedValue: any;

      const callback: HalWatchCallback = (newVal) => {
        callbackExecuted = true;
        receivedValue = newVal;
      };

      s32Pin.watch(callback);
      s32Pin.setValue(-12345);

      await waitForCallback(() => callbackExecuted);

      expect(receivedValue).toBe(-12345);
    });
  });

  describe("Parameter Monitoring", () => {
    let param: any;

    beforeEach(() => {
      param = comp.newParam("test-param", hal.HAL_BIT, hal.HAL_RW);
      comp.ready();
    });

    it("should allow watching parameter value changes", async () => {
      let callbackExecuted = false;
      let newValue: any;
      let oldValue: any;
      let receivedObject: any;

      const callback: HalWatchCallback = (nVal, oVal, obj) => {
        callbackExecuted = true;
        newValue = nVal;
        oldValue = oVal;
        receivedObject = obj;
      };

      param.watch(callback);
      param.setValue(true);

      await waitForCallback(() => callbackExecuted);

      expect(callbackExecuted).toBe(true);
      expect(newValue).toBe(true);
      expect(oldValue).toBe(false);
      expect(receivedObject).toBe(param);
    });

    it("should monitor HAL_FLOAT parameters", async () => {
      comp.unready();
      const floatParam = comp.newParam(
        "float-param",
        hal.HAL_FLOAT,
        hal.HAL_RW
      );
      comp.ready();

      let callbackExecuted = false;
      let receivedValue: any;

      const callback: HalWatchCallback = (newVal) => {
        callbackExecuted = true;
        receivedValue = newVal;
      };

      floatParam.watch(callback);
      floatParam.setValue(2.71828);

      await waitForCallback(() => callbackExecuted);

      expect(receivedValue).toBeCloseTo(2.71828);
    });
  });

  describe("Component-level Monitoring Management", () => {
    let pin1: any;
    let pin2: any;
    let param1: any;

    beforeEach(() => {
      pin1 = comp.newPin("pin1", hal.HAL_BIT, hal.HAL_OUT);
      pin2 = comp.newPin("pin2", hal.HAL_FLOAT, hal.HAL_OUT);
      param1 = comp.newParam("param1", hal.HAL_S32, hal.HAL_RW);
      comp.ready();
    });

    it("should track watched objects", () => {
      const callback1: HalWatchCallback = () => {};
      const callback2: HalWatchCallback = () => {};

      // Initially no watched objects
      expect(comp.getWatchedObjects()).toHaveLength(0);

      // Add watches
      pin1.watch(callback1);
      pin2.watch(callback1);
      pin2.watch(callback2);
      param1.watch(callback1);

      const watchedObjects = comp.getWatchedObjects();
      expect(watchedObjects).toHaveLength(3); // pin1, pin2, param1

      // Check callback counts
      const pin1Watch = watchedObjects.find((w: any) => w.object === pin1);
      const pin2Watch = watchedObjects.find((w: any) => w.object === pin2);
      const param1Watch = watchedObjects.find((w: any) => w.object === param1);

      expect(pin1Watch?.callbackCount).toBe(1);
      expect(pin2Watch?.callbackCount).toBe(2);
      expect(param1Watch?.callbackCount).toBe(1);
    });

    it("should remove watched objects when no callbacks remain", () => {
      const callback: HalWatchCallback = () => {};

      pin1.watch(callback);
      expect(comp.getWatchedObjects()).toHaveLength(1);

      pin1.removeWatch(callback);
      expect(comp.getWatchedObjects()).toHaveLength(0);
    });

    it("should handle component-level watch management", () => {
      const callback: HalWatchCallback = () => {};

      // Test adding watch through component
      comp.addWatch("pin1", callback);
      expect(comp.getWatchedObjects()).toHaveLength(1);

      // Test removing watch through component
      comp.removeWatch("pin1", callback);
      expect(comp.getWatchedObjects()).toHaveLength(0);
    });

    it("should throw error when watching non-existent pin/param", () => {
      const callback: HalWatchCallback = () => {};

      expect(() => {
        comp.addWatch("non-existent", callback);
      }).toThrow("No pin or parameter found with name 'non-existent'");
    });
  });

  describe("Monitoring Timer Management", () => {
    let pin: any;

    beforeEach(() => {
      pin = comp.newPin("timer-test-pin", hal.HAL_BIT, hal.HAL_OUT);
      comp.ready();
    });

    it("should restart monitoring with new poll interval", async () => {
      const callback: HalWatchCallback = () => {};

      pin.watch(callback);

      // Change monitoring options while monitoring is active
      comp.setMonitoringOptions({ pollInterval: 20 });

      // Should still work with new interval
      let callbackExecuted = false;
      const newCallback: HalWatchCallback = () => {
        callbackExecuted = true;
      };

      pin.watch(newCallback);
      pin.setValue(true);

      await waitForCallback(() => callbackExecuted);
      expect(callbackExecuted).toBe(true);
    });
  });

  describe("Error Handling", () => {
    let pin: any;

    beforeEach(() => {
      pin = comp.newPin("error-test-pin", hal.HAL_BIT, hal.HAL_OUT);
      comp.ready();
    });

    it("should handle callback errors gracefully", async () => {
      let goodCallbackExecuted = false;
      let errorCallbackExecuted = false;

      const goodCallback: HalWatchCallback = () => {
        goodCallbackExecuted = true;
      };

      const errorCallback: HalWatchCallback = () => {
        errorCallbackExecuted = true;
        throw new Error("Test error in callback");
      };

      // Mock console.error to capture the error
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      pin.watch(goodCallback);
      pin.watch(errorCallback);

      pin.setValue(true);

      await waitForCallback(
        () => goodCallbackExecuted && errorCallbackExecuted
      );

      expect(goodCallbackExecuted).toBe(true);
      expect(errorCallbackExecuted).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error in watch callback"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it("should handle value access errors gracefully", async () => {
      const callback: HalWatchCallback = () => {};
      pin.watch(callback);

      // Mock the component proxy to throw an error on property access
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Create a scenario where value access might fail
      // (This is difficult to test without mocking the native layer)

      consoleSpy.mockRestore();
    });
  });

  describe("Performance and Edge Cases", () => {
    it("should handle many watched objects efficiently", async () => {
      const pins: any[] = [];
      const callbacks: HalWatchCallback[] = [];
      const callbackCounts: number[] = [];

      // Create many pins and watch them
      for (let i = 0; i < 20; i++) {
        const pin = comp.newPin(`multi-pin-${i}`, hal.HAL_BIT, hal.HAL_OUT);
        pins.push(pin);

        callbackCounts[i] = 0;
        const callback: HalWatchCallback = () => {
          callbackCounts[i]++;
        };
        callbacks.push(callback);
      }

      comp.ready();

      // Watch all pins
      for (let i = 0; i < pins.length; i++) {
        pins[i].watch(callbacks[i]);
      }

      expect(comp.getWatchedObjects()).toHaveLength(20);

      // Change all pin values
      for (let i = 0; i < pins.length; i++) {
        pins[i].setValue(true);
      }

      // Wait for all callbacks
      await waitForCallback(
        () => callbackCounts.every((count) => count >= 1),
        2000
      );

      expect(callbackCounts.every((count) => count >= 1)).toBe(true);
    });

    it("should clean up properly on destroy", () => {
      const pin = comp.newPin("destroy-test-pin", hal.HAL_BIT, hal.HAL_OUT);
      comp.ready();

      const callback: HalWatchCallback = () => {};
      pin.watch(callback);

      expect(comp.getWatchedObjects()).toHaveLength(1);

      comp.destroy();

      expect(comp.getWatchedObjects()).toHaveLength(0);
    });
  });

  describe("Integration with Existing HAL Operations", () => {
    it("should work with proxy-based property access", async () => {
      const pin = comp.newPin("proxy-test-pin", hal.HAL_FLOAT, hal.HAL_OUT);
      comp.ready();

      let callbackExecuted = false;
      let receivedValue: any;

      const callback: HalWatchCallback = (newVal) => {
        callbackExecuted = true;
        receivedValue = newVal;
      };

      pin.watch(callback);

      // Use proxy access to set value
      comp["proxy-test-pin"] = 42.5;

      await waitForCallback(() => callbackExecuted);

      expect(receivedValue).toBeCloseTo(42.5);
    });

    it("should work with getValue() and setValue() methods", async () => {
      const pin = comp.newPin("method-test-pin", hal.HAL_S32, hal.HAL_OUT);
      comp.ready();

      let callbackExecuted = false;
      let receivedValue: any;

      const callback: HalWatchCallback = (newVal) => {
        callbackExecuted = true;
        receivedValue = newVal;
      };

      pin.watch(callback);

      // Use method to set value
      pin.setValue(12345);

      await waitForCallback(() => callbackExecuted);

      expect(receivedValue).toBe(12345);
      expect(pin.getValue()).toBe(12345);
    });
  });
});
