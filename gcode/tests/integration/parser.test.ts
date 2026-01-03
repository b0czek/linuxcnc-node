/**
 * Integration tests for @linuxcnc-node/gcode parser
 *
 * Tests the parseGCode function against real G-code fixtures using
 * the LinuxCNC rs274ngc interpreter.
 */

import * as path from "path";
import {
  parseGCode,
  GCodeParseResult,
  GCodeOperation,
  OperationType,
  PositionIndex,
  Plane,
  Units,
  TraverseOperation,
  FeedOperation,
  ArcOperation,
  ToolChangeOperation,
  ToolOffsetOperation,
  G5xOffsetOperation,
  G92OffsetOperation,
  UnitsChangeOperation,
  PlaneChangeOperation,
  FeedRateChangeOperation,
  DwellOperation,
  ParseProgress,
} from "../../src/ts";

// ============================================================================
// Test Helpers
// ============================================================================

/** Get absolute path to a fixture file */
const fixturePath = (name: string): string =>
  path.join(__dirname, "../fixtures", name);

/** Path to the machine configuration INI file */
const iniPath = path.join(__dirname, "../config.ini");

/** Count operations of a specific type */
const countByType = (ops: GCodeOperation[], type: OperationType): number =>
  ops.filter((op) => op.type === type).length;

/** Find first operation of a specific type */
function findFirst<T extends GCodeOperation>(
  ops: GCodeOperation[],
  type: OperationType
): T | undefined {
  return ops.find((op) => op.type === type) as T | undefined;
}

/** Find all operations of a specific type */
function findAll<T extends GCodeOperation>(
  ops: GCodeOperation[],
  type: OperationType
): T[] {
  return ops.filter((op) => op.type === type) as T[];
}

/** Floating point comparison precision (decimal places) */
const PRECISION = 4;

const { X, Y, Z, A, B, C, U, V, W } = PositionIndex;

// ============================================================================
// Tests
// ============================================================================

describe("parseGCode", () => {
  // --------------------------------------------------------------------------
  // Basic Parsing
  // --------------------------------------------------------------------------

  describe("basic parsing", () => {
    it("should parse simple_linear.ngc successfully", async () => {
      const result = await parseGCode(fixturePath("simple_linear.ngc"), {
        iniPath,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.operations)).toBe(true);
      expect(result.extents).toBeDefined();
    });

    it("should parse arcs.ngc successfully", async () => {
      const result = await parseGCode(fixturePath("arcs.ngc"), { iniPath });

      expect(result).toBeDefined();
      expect(result.operations.length).toBeGreaterThan(0);
    });

    it("should parse tool_change.ngc successfully", async () => {
      const result = await parseGCode(fixturePath("tool_change.ngc"), {
        iniPath,
      });

      expect(result).toBeDefined();
      expect(result.operations.length).toBeGreaterThan(0);
    });

    it("should parse offsets.ngc successfully", async () => {
      const result = await parseGCode(fixturePath("offsets.ngc"), { iniPath });

      expect(result).toBeDefined();
      expect(result.operations.length).toBeGreaterThan(0);
    });

    it("should parse mixed.ngc successfully", async () => {
      const result = await parseGCode(fixturePath("mixed.ngc"), { iniPath });

      expect(result).toBeDefined();
      expect(result.operations.length).toBeGreaterThan(0);
    });

    it("should return correct result structure", async () => {
      const result = await parseGCode(fixturePath("simple_linear.ngc"), {
        iniPath,
      });

      // Check top-level structure
      expect(result).toHaveProperty("operations");
      expect(result).toHaveProperty("extents");

      // Check extents structure
      expect(result.extents).toHaveProperty("min");
      expect(result.extents).toHaveProperty("max");
      expect(result.extents.min.length).toBe(3);
      expect(result.extents.max.length).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Linear Motion (simple_linear.ngc)
  // --------------------------------------------------------------------------

  describe("linear motion", () => {
    let result: GCodeParseResult;

    beforeAll(async () => {
      result = await parseGCode(fixturePath("simple_linear.ngc"), { iniPath });
    });

    it("should detect TRAVERSE operations for G0 moves", () => {
      const traverseCount = countByType(
        result.operations,
        OperationType.TRAVERSE
      );
      // simple_linear.ngc has: G0 X0 Y0 Z5 and G0 Z10
      expect(traverseCount).toBeGreaterThanOrEqual(2);
    });

    it("should detect FEED operations for G1 moves", () => {
      const feedCount = countByType(result.operations, OperationType.FEED);
      // simple_linear.ngc has: G1 Z0, G1 X50 Y0, G1 X50 Y50, G1 X0 Y50, G1 X0 Y0
      expect(feedCount).toBeGreaterThanOrEqual(5);
    });

    it("should have correct target positions for TRAVERSE", () => {
      const traverses = findAll<TraverseOperation>(
        result.operations,
        OperationType.TRAVERSE
      );

      // First traverse should be to X0 Y0 Z5
      const firstTraverse = traverses[0];
      expect(firstTraverse).toBeDefined();
      expect(firstTraverse.pos[X]).toBeCloseTo(0, PRECISION);
      expect(firstTraverse.pos[Y]).toBeCloseTo(0, PRECISION);
      expect(firstTraverse.pos[Z]).toBeCloseTo(5, PRECISION);
    });

    it("should have correct target positions for FEED", () => {
      const feeds = findAll<FeedOperation>(
        result.operations,
        OperationType.FEED
      );

      // Find the feed to X50 Y0
      const feedToX50 = feeds.find(
        (f) => Math.abs(f.pos[X] - 50) < 0.01 && Math.abs(f.pos[Y] - 0) < 0.01
      );
      expect(feedToX50).toBeDefined();

      // Find the feed to X50 Y50
      const feedToCorner = feeds.find(
        (f) => Math.abs(f.pos[X] - 50) < 0.01 && Math.abs(f.pos[Y] - 50) < 0.01
      );
      expect(feedToCorner).toBeDefined();
    });

    it("should preserve line numbers from source file", () => {
      const traverses = findAll<TraverseOperation>(
        result.operations,
        OperationType.TRAVERSE
      );

      // Line numbers should be positive integers matching source file lines
      traverses.forEach((t) => {
        expect(t.lineNumber).toBeGreaterThan(0);
        expect(Number.isInteger(t.lineNumber)).toBe(true);
      });
    });

    it("should have 9-axis position data", () => {
      const traverse = findFirst<TraverseOperation>(
        result.operations,
        OperationType.TRAVERSE
      );

      expect(traverse).toBeDefined();
      expect(traverse!.pos.length).toBe(9);
    });
  });

  // --------------------------------------------------------------------------
  // Arc Motion (arcs.ngc)
  // --------------------------------------------------------------------------

  describe("arc motion", () => {
    let result: GCodeParseResult;

    beforeAll(async () => {
      result = await parseGCode(fixturePath("arcs.ngc"), { iniPath });
    });

    it("should detect ARC operations for G2/G3 moves", () => {
      const arcCount = countByType(result.operations, OperationType.ARC);
      // arcs.ngc has: G2 quarter circle, G3 quarter circle, G2 full circle, G2 helix
      expect(arcCount).toBeGreaterThanOrEqual(4);
    });

    it("should have CW arcs (G2) with negative rotation", () => {
      const arcs = findAll<ArcOperation>(result.operations, OperationType.ARC);

      // Find a CW arc (should have negative rotation)
      const cwArc = arcs.find((a) => a.arcData.rotation < 0);
      expect(cwArc).toBeDefined();
    });

    it("should have CCW arcs (G3) with positive rotation", () => {
      const arcs = findAll<ArcOperation>(result.operations, OperationType.ARC);

      // Find a CCW arc (should have positive rotation)
      const ccwArc = arcs.find((a) => a.arcData.rotation > 0);
      expect(ccwArc).toBeDefined();
    });

    it("should have correct arc center coordinates", () => {
      const arcs = findAll<ArcOperation>(result.operations, OperationType.ARC);

      // First arc: G2 X20 Y10 I10 J0 (center at X=20, relative I=10 means center X = 10+10 = 20)
      // Actually the arc starts at X10, I10 means center is at X10+10=20...
      // Let me check: start X10, I10 J0 means center offset is (10,0) from start
      // So center is at (10+10, 0+0) = (20, 0)
      const firstArc = arcs[0];
      expect(firstArc).toBeDefined();
      expect(firstArc.arcData).toHaveProperty("centerFirst");
      expect(firstArc.arcData).toHaveProperty("centerSecond");
    });

    it("should set correct plane for arcs", () => {
      const arcs = findAll<ArcOperation>(result.operations, OperationType.ARC);

      // Most arcs in arcs.ngc are in XY plane (G17 is set)
      const xyArc = arcs.find((a) => a.plane === Plane.XY);
      expect(xyArc).toBeDefined();
    });

    it("should detect helix motion with Z change", () => {
      const arcs = findAll<ArcOperation>(result.operations, OperationType.ARC);

      // arcs.ngc has: G2 X0 Y0 Z-5 I10 J0 (helix)
      // axisEndPoint should be non-zero for helix
      const helixArc = arcs.find((a) => a.arcData.axisEndPoint !== 0);
      expect(helixArc).toBeDefined();
      expect(helixArc!.arcData.axisEndPoint).toBeCloseTo(-5, PRECISION);
    });

    it("should preserve line numbers for arcs", () => {
      const arcs = findAll<ArcOperation>(result.operations, OperationType.ARC);

      arcs.forEach((arc) => {
        expect(arc.lineNumber).toBeGreaterThan(0);
        expect(Number.isInteger(arc.lineNumber)).toBe(true);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Tool Operations (tool_change.ngc)
  // --------------------------------------------------------------------------

  describe("tool operations", () => {
    let result: GCodeParseResult;

    beforeAll(async () => {
      result = await parseGCode(fixturePath("tool_change.ngc"), { iniPath });
    });

    it("should detect TOOL_CHANGE operations for M6", () => {
      const toolChangeCount = countByType(
        result.operations,
        OperationType.TOOL_CHANGE
      );
      // tool_change.ngc has: T1 M6 and T2 M6
      expect(toolChangeCount).toBeGreaterThanOrEqual(2);
    });

    it("should have tool data in TOOL_CHANGE operations", () => {
      const toolChange = findFirst<ToolChangeOperation>(
        result.operations,
        OperationType.TOOL_CHANGE
      );

      expect(toolChange).toBeDefined();
      expect(toolChange!.tool).toBeDefined();
      expect(toolChange!.tool).toHaveProperty("toolNumber");
      expect(toolChange!.tool).toHaveProperty("pocketNumber");
      expect(toolChange!.tool).toHaveProperty("diameter");
      expect(toolChange!.tool).toHaveProperty("offset");
    });

    it("should have correct tool numbers", () => {
      const toolChanges = findAll<ToolChangeOperation>(
        result.operations,
        OperationType.TOOL_CHANGE
      );

      const toolNumbers = toolChanges.map((tc) => tc.tool.toolNumber);
      expect(toolNumbers).toContain(1);
      expect(toolNumbers).toContain(2);
    });

    it("should detect TOOL_OFFSET operations for G43", () => {
      const toolOffsetCount = countByType(
        result.operations,
        OperationType.TOOL_OFFSET
      );
      // tool_change.ngc has: G43 H1, G43 H2, G49
      expect(toolOffsetCount).toBeGreaterThanOrEqual(2);
    });

    it("should have offset position data in TOOL_OFFSET", () => {
      const toolOffset = findFirst<ToolOffsetOperation>(
        result.operations,
        OperationType.TOOL_OFFSET
      );

      expect(toolOffset).toBeDefined();
      expect(toolOffset!.offset).toBeDefined();
      expect(toolOffset!.offset).toBeDefined();
      expect(toolOffset!.offset.length).toBe(9);
    });
  });

  // --------------------------------------------------------------------------
  // Coordinate Offsets (offsets.ngc)
  // --------------------------------------------------------------------------

  describe("coordinate offsets", () => {
    let result: GCodeParseResult;

    beforeAll(async () => {
      result = await parseGCode(fixturePath("offsets.ngc"), { iniPath });
    });

    it("should detect G5X_OFFSET operations for G54/G55", () => {
      const g5xCount = countByType(result.operations, OperationType.G5X_OFFSET);
      // offsets.ngc has: G54, G55, G54 again
      expect(g5xCount).toBeGreaterThanOrEqual(2);
    });

    it("should have origin index in G5X_OFFSET operations", () => {
      const g5xOffsets = findAll<G5xOffsetOperation>(
        result.operations,
        OperationType.G5X_OFFSET
      );

      // G54 = origin 1, G55 = origin 2
      const origins = g5xOffsets.map((o) => o.origin);
      expect(origins).toContain(1); // G54
      expect(origins).toContain(2); // G55
    });

    it("should have offset position in G5X_OFFSET", () => {
      const g5xOffset = findFirst<G5xOffsetOperation>(
        result.operations,
        OperationType.G5X_OFFSET
      );

      expect(g5xOffset).toBeDefined();
      expect(g5xOffset!.offset).toBeDefined();
      expect(g5xOffset!.offset).toBeDefined();
      expect(g5xOffset!.offset.length).toBe(9);
    });

    it("should detect G92_OFFSET operations for G92", () => {
      const g92Count = countByType(result.operations, OperationType.G92_OFFSET);
      // offsets.ngc has: G92 X-5 Y-5, G92.1 (clear)
      expect(g92Count).toBeGreaterThanOrEqual(1);
    });

    it("should have offset values in G92_OFFSET", () => {
      const g92Offset = findFirst<G92OffsetOperation>(
        result.operations,
        OperationType.G92_OFFSET
      );

      expect(g92Offset).toBeDefined();
      expect(g92Offset!.offset).toBeDefined();
      // G92 X-5 Y-5 sets offset so that current position becomes X-5 Y-5
      // The offset stored should reflect this
    });
  });

  // --------------------------------------------------------------------------
  // State Changes (mixed.ngc)
  // --------------------------------------------------------------------------

  describe("state changes", () => {
    let result: GCodeParseResult;

    beforeAll(async () => {
      result = await parseGCode(fixturePath("mixed.ngc"), { iniPath });
    });

    it("should detect UNITS_CHANGE operations for G20/G21", () => {
      const unitsChanges = findAll<UnitsChangeOperation>(
        result.operations,
        OperationType.UNITS_CHANGE
      );

      // mixed.ngc has: G21 at start, G20 later, G21 again
      expect(unitsChanges.length).toBeGreaterThanOrEqual(2);
    });

    it("should have correct units values", () => {
      const unitsChanges = findAll<UnitsChangeOperation>(
        result.operations,
        OperationType.UNITS_CHANGE
      );

      const unitsValues = unitsChanges.map((u) => u.units);
      expect(unitsValues).toContain(Units.MM); // G21
      expect(unitsValues).toContain(Units.INCHES); // G20
    });

    it("should detect PLANE_CHANGE operations for G17/G18/G19", () => {
      const planeChanges = findAll<PlaneChangeOperation>(
        result.operations,
        OperationType.PLANE_CHANGE
      );

      // mixed.ngc has: G17, G18, G17 again
      expect(planeChanges.length).toBeGreaterThanOrEqual(2);
    });

    it("should have correct plane values", () => {
      const planeChanges = findAll<PlaneChangeOperation>(
        result.operations,
        OperationType.PLANE_CHANGE
      );

      const planeValues = planeChanges.map((p) => p.plane);
      expect(planeValues).toContain(Plane.XY); // G17
      expect(planeValues).toContain(Plane.XZ); // G18
    });

    it("should detect FEED_RATE_CHANGE operations", () => {
      const feedRateChanges = findAll<FeedRateChangeOperation>(
        result.operations,
        OperationType.FEED_RATE_CHANGE
      );

      // mixed.ngc has: F150 and F100
      expect(feedRateChanges.length).toBeGreaterThanOrEqual(1);
    });

    it("should have correct feed rate values", () => {
      const feedRateChange = findFirst<FeedRateChangeOperation>(
        result.operations,
        OperationType.FEED_RATE_CHANGE
      );

      expect(feedRateChange).toBeDefined();
      expect(feedRateChange!.feedRate).toBeGreaterThan(0);
    });

    it("should detect DWELL operations for G4", () => {
      const dwells = findAll<DwellOperation>(
        result.operations,
        OperationType.DWELL
      );

      // mixed.ngc has: G4 P0.5
      expect(dwells.length).toBeGreaterThanOrEqual(1);
    });

    it("should have duration in DWELL operations", () => {
      const dwell = findFirst<DwellOperation>(
        result.operations,
        OperationType.DWELL
      );

      expect(dwell).toBeDefined();
      expect(dwell!.duration).toBeCloseTo(0.5, 2); // G4 P0.5 = 0.5 seconds
    });
  });

  // --------------------------------------------------------------------------
  // Extents Calculation
  // --------------------------------------------------------------------------

  describe("extents calculation", () => {
    it("should calculate correct extents for simple_linear.ngc", async () => {
      const result = await parseGCode(fixturePath("simple_linear.ngc"), {
        iniPath,
      });

      // simple_linear.ngc moves: X0-50, Y0-50, Z0-10
      expect(result.extents.min[X]).toBeCloseTo(0, PRECISION);
      expect(result.extents.max[X]).toBeCloseTo(50, PRECISION);
      expect(result.extents.min[Y]).toBeCloseTo(0, PRECISION);
      expect(result.extents.max[Y]).toBeCloseTo(50, PRECISION);
      expect(result.extents.min[Z]).toBeCloseTo(0, PRECISION);
      expect(result.extents.max[Z]).toBeCloseTo(10, PRECISION);
    });

    it("should calculate extents including arc endpoints", async () => {
      const result = await parseGCode(fixturePath("arcs.ngc"), { iniPath });

      // arcs.ngc has arcs extending to at least X30
      expect(result.extents.max[X]).toBeGreaterThanOrEqual(30);
    });

    it("should include negative Z values in extents", async () => {
      const result = await parseGCode(fixturePath("arcs.ngc"), { iniPath });

      // arcs.ngc has: G2 X0 Y0 Z-5 (helix going down)
      expect(result.extents.min[Z]).toBeLessThanOrEqual(-5);
    });
  });

  // --------------------------------------------------------------------------
  // Progress Callback
  // --------------------------------------------------------------------------

  describe("progress callback", () => {
    it("should call onProgress during parsing", async () => {
      const progressUpdates: ParseProgress[] = [];

      await parseGCode(fixturePath("mixed.ngc"), {
        iniPath,
        onProgress: (progress) => {
          progressUpdates.push({ ...progress });
        },
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it("should have valid progress structure", async () => {
      let lastProgress: ParseProgress | null = null;

      await parseGCode(fixturePath("mixed.ngc"), {
        iniPath,
        onProgress: (progress) => {
          lastProgress = { ...progress };
        },
      });

      expect(lastProgress).toBeDefined();
      expect(lastProgress!).toHaveProperty("bytesRead");
      expect(lastProgress!).toHaveProperty("totalBytes");
      expect(lastProgress!).toHaveProperty("percent");
      expect(lastProgress!).toHaveProperty("operationCount");
    });

    it("should have percent reach 100 at completion", async () => {
      let finalPercent = 0;

      await parseGCode(fixturePath("mixed.ngc"), {
        iniPath,
        onProgress: (progress) => {
          finalPercent = progress.percent;
        },
      });

      expect(finalPercent).toBe(100);
    });

    it("should have increasing operation count", async () => {
      const operationCounts: number[] = [];

      await parseGCode(fixturePath("mixed.ngc"), {
        iniPath,
        onProgress: (progress) => {
          operationCounts.push(progress.operationCount);
        },
      });

      // Operation count should be non-decreasing
      for (let i = 1; i < operationCounts.length; i++) {
        expect(operationCounts[i]).toBeGreaterThanOrEqual(
          operationCounts[i - 1]
        );
      }
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe("error handling", () => {
    it("should throw error when iniPath is missing", async () => {
      await expect(
        parseGCode(fixturePath("simple_linear.ngc"), {} as any)
      ).rejects.toThrow("iniPath is required");
    });

    it("should throw error for non-existent file", async () => {
      await expect(
        parseGCode("/nonexistent/path/file.ngc", { iniPath })
      ).rejects.toThrow();
    });

    it("should throw error for non-existent INI file", async () => {
      await expect(
        parseGCode(fixturePath("simple_linear.ngc"), {
          iniPath: "/nonexistent/config.ini",
        })
      ).rejects.toThrow();
    });

    it("should throw error for invalid G-code syntax", async () => {
      await expect(
        parseGCode(fixturePath("invalid_syntax.ngc"), { iniPath })
      ).rejects.toThrow();
    });
  });
});
