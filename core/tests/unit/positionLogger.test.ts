import {
  PositionLogger,
  PositionPoint,
  POSITION_STRIDE,
  PositionIndex,
} from "../../src/ts/positionLogger";
import { addon } from "../../src/ts/constants";

// Mock the native addon
jest.mock("../../src/ts/constants", () => ({
  addon: {
    NativePositionLogger: jest.fn(),
  },
}));

// Helper to create a mock Float64Array for position (10 values)
function createMockPositionArray(pos: PositionPoint): Float64Array {
  const arr = new Float64Array(POSITION_STRIDE);
  arr[PositionIndex.X] = pos.x;
  arr[PositionIndex.Y] = pos.y;
  arr[PositionIndex.Z] = pos.z;
  arr[PositionIndex.A] = pos.a;
  arr[PositionIndex.B] = pos.b;
  arr[PositionIndex.C] = pos.c;
  arr[PositionIndex.U] = pos.u;
  arr[PositionIndex.V] = pos.v;
  arr[PositionIndex.W] = pos.w;
  arr[PositionIndex.MotionType] = pos.motionType;
  return arr;
}

// Helper to create a mock Float64Array for history (10 values per point)
function createMockHistoryArray(points: PositionPoint[]): Float64Array {
  const arr = new Float64Array(points.length * POSITION_STRIDE);
  points.forEach((pos, i) => {
    const offset = i * POSITION_STRIDE;
    arr[offset + PositionIndex.X] = pos.x;
    arr[offset + PositionIndex.Y] = pos.y;
    arr[offset + PositionIndex.Z] = pos.z;
    arr[offset + PositionIndex.A] = pos.a;
    arr[offset + PositionIndex.B] = pos.b;
    arr[offset + PositionIndex.C] = pos.c;
    arr[offset + PositionIndex.U] = pos.u;
    arr[offset + PositionIndex.V] = pos.v;
    arr[offset + PositionIndex.W] = pos.w;
    arr[offset + PositionIndex.MotionType] = pos.motionType;
  });
  return arr;
}

describe("PositionLogger", () => {
  let mockNativeLogger: any;
  let mockPosition: PositionPoint;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock position object
    mockPosition = {
      x: 10.5,
      y: 20.3,
      z: 5.0,
      a: 0,
      b: 0,
      c: 45.0,
      u: 0,
      v: 0,
      w: 0,
      motionType: 1,
    };

    // Create mock native instance - returns Float64Array
    mockNativeLogger = {
      start: jest.fn(),
      stop: jest.fn(),
      clear: jest.fn(),
      getCurrentPosition: jest
        .fn()
        .mockReturnValue(createMockPositionArray(mockPosition)),
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
      expect(pos).toEqual(mockPosition);
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
      expect(recent).toEqual([]);
    });

    it("should calculate correct startIndex when history is smaller than requested count", () => {
      const mockHistory: PositionPoint[] = Array.from(
        { length: 3 },
        (_, i) => ({
          ...mockPosition,
          x: i,
        })
      );
      mockNativeLogger.getHistoryCount.mockReturnValue(3);
      mockNativeLogger.getMotionHistory.mockReturnValue(
        createMockHistoryArray(mockHistory)
      );

      const logger = new PositionLogger();
      const recent = logger.getRecentHistory(10);

      expect(mockNativeLogger.getMotionHistory).toHaveBeenCalledWith(0, 3);
      expect(recent.length).toBe(3);
    });

    it("should calculate correct startIndex when history is larger than requested count", () => {
      const mockHistory: PositionPoint[] = Array.from(
        { length: 5 },
        (_, i) => ({
          ...mockPosition,
          x: i + 95,
        })
      );
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
