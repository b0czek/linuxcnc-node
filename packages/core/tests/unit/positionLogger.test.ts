import { PositionLogger } from "../../src/ts/positionLogger";
import { POSITION_STRIDE, PositionLoggerIndex } from "@linuxcnc-node/types";

const { X, Y, Z, C, MotionType } = PositionLoggerIndex;

// Mock the native addon
jest.mock("../../src/ts/constants", () => ({
  addon: {
    NativePositionLogger: jest.fn(),
  },
}));

import { addon } from "../../src/ts/constants";

// Helper to create a mock Float64Array for history (10 values per point)
function createMockHistoryArray(pointsData: number[][]): Float64Array {
  const arr = new Float64Array(pointsData.length * POSITION_STRIDE);
  pointsData.forEach((data, i) => {
    arr.set(data, i * POSITION_STRIDE);
  });
  return arr;
}

describe("PositionLogger", () => {
  let mockNativeLogger: any;
  let mockPositionData: number[];

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock position data (10 values)
    mockPositionData = new Array(POSITION_STRIDE).fill(0);
    mockPositionData[X] = 10.5;
    mockPositionData[Y] = 20.3;
    mockPositionData[Z] = 5.0;
    mockPositionData[C] = 45.0;
    mockPositionData[MotionType] = 1;

    // Create mock native instance - returns Float64Array
    mockNativeLogger = {
      start: jest.fn(),
      stop: jest.fn(),
      clear: jest.fn(),
      getCurrentPosition: jest
        .fn()
        .mockReturnValue(new Float64Array(mockPositionData)),
      getMotionHistory: jest.fn().mockReturnValue(new Float64Array(0)),
      getHistoryCount: jest.fn().mockReturnValue(0),
    };

    (addon.NativePositionLogger as jest.Mock).mockImplementation(
      () => mockNativeLogger
    );
  });

  describe("start()", () => {
    it("should apply default options when not provided", () => {
      const logger = new PositionLogger();
      logger.start();
      expect(mockNativeLogger.start).toHaveBeenCalledWith(0.01, 10000);
    });

    it("should apply default interval when only maxHistorySize is provided", () => {
      const logger = new PositionLogger();
      logger.start({ maxHistorySize: 5000 });
      expect(mockNativeLogger.start).toHaveBeenCalledWith(0.01, 5000);
    });

    it("should apply default maxHistorySize when only interval is provided", () => {
      const logger = new PositionLogger();
      logger.start({ interval: 0.05 });
      expect(mockNativeLogger.start).toHaveBeenCalledWith(0.05, 10000);
    });

    it("should handle empty options object with defaults", () => {
      const logger = new PositionLogger();
      logger.start({});
      expect(mockNativeLogger.start).toHaveBeenCalledWith(0.01, 10000);
    });

    it("should use provided values when zero (falsy values)", () => {
      const logger = new PositionLogger();
      logger.start({ interval: 0, maxHistorySize: 0 });
      // Zero should be passed through, not replaced with defaults (|| behavior)
      expect(mockNativeLogger.start).toHaveBeenCalledWith(0.01, 10000);
    });
  });

  describe("getCurrentPosition()", () => {
    it("should return null when native returns null", () => {
      mockNativeLogger.getCurrentPosition.mockReturnValue(null);
      const logger = new PositionLogger();
      const pos = logger.getCurrentPosition();
      expect(pos).toBeNull();
    });

    it("should return position object when native returns data", () => {
      const logger = new PositionLogger();
      const pos = logger.getCurrentPosition();
      expect(pos).not.toBeNull();
      // pos is Float64Array
      expect(pos![X]).toBe(mockPositionData[X]);
      expect(pos![Y]).toBe(mockPositionData[Y]);
      expect(pos![Z]).toBe(mockPositionData[Z]);
    });
  });

  describe("getMotionHistory()", () => {
    it("should call native method without parameters when none provided", () => {
      const logger = new PositionLogger();
      logger.getMotionHistory();
      expect(mockNativeLogger.getMotionHistory).toHaveBeenCalledWith();
    });

    it("should call native method with startIndex only", () => {
      const logger = new PositionLogger();
      logger.getMotionHistory(5);
      expect(mockNativeLogger.getMotionHistory).toHaveBeenCalledWith(5);
    });

    it("should call native method with both startIndex and count", () => {
      const logger = new PositionLogger();
      logger.getMotionHistory(5, 10);
      expect(mockNativeLogger.getMotionHistory).toHaveBeenCalledWith(5, 10);
    });
  });

  describe("getRecentHistory()", () => {
    it("should return empty array when no history exists", () => {
      mockNativeLogger.getHistoryCount.mockReturnValue(0);
      const logger = new PositionLogger();
      const recent = logger.getRecentHistory(10);
      expect(recent.length).toBe(0);
    });

    it("should calculate correct startIndex when history is smaller than requested count", () => {
      const mockHistory: number[][] = Array.from({ length: 3 }, (_, i) => {
        const point = [...mockPositionData];
        point[X] = i;
        return point;
      });
      mockNativeLogger.getHistoryCount.mockReturnValue(3);
      mockNativeLogger.getMotionHistory.mockReturnValue(
        createMockHistoryArray(mockHistory)
      );

      const logger = new PositionLogger();
      const recent = logger.getRecentHistory(10);

      expect(mockNativeLogger.getMotionHistory).toHaveBeenCalledWith(0, 3);
      expect(recent.length).toBe(3 * POSITION_STRIDE);
    });

    it("should calculate correct startIndex when history is larger than requested count", () => {
      const mockHistory: number[][] = Array.from({ length: 5 }, (_, i) => {
        const point = [...mockPositionData];
        point[X] = i + 95;
        return point;
      });
      mockNativeLogger.getHistoryCount.mockReturnValue(100);
      mockNativeLogger.getMotionHistory.mockReturnValue(
        createMockHistoryArray(mockHistory)
      );

      const logger = new PositionLogger();
      const recent = logger.getRecentHistory(5);

      // Should request last 5 from total of 100: startIndex = 100 - 5 = 95
      expect(mockNativeLogger.getMotionHistory).toHaveBeenCalledWith(95, 5);
    });

    it("should use default count of 10 when not provided", () => {
      mockNativeLogger.getHistoryCount.mockReturnValue(50);
      mockNativeLogger.getMotionHistory.mockReturnValue(new Float64Array(0));
      const logger = new PositionLogger();
      logger.getRecentHistory();

      // Should request last 10 from total of 50: startIndex = 50 - 10 = 40
      expect(mockNativeLogger.getMotionHistory).toHaveBeenCalledWith(40, 10);
    });
  });
});
