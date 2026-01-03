/**
 * Performance benchmark tests for @linuxcnc-node/gcode parser
 *
 * Uses a pre-generated 1MB G-code file for consistent benchmarking.
 * Generate the file with: node tests/fixtures/generate_large.js
 */

import * as fs from "fs";
import * as path from "path";
import { parseGCode } from "../../src/ts";

// ============================================================================
// Configuration
// ============================================================================

/** Path to the machine configuration INI file */
const iniPath = path.join(__dirname, "../config.ini");

/** Path for the pre-generated large test file */
const largeFilePath = path.join(__dirname, "../fixtures/large_1mb.ngc");

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format duration as human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Generate the large benchmark file if it doesn't exist
 */
function ensureLargeFileExists(): number {
  if (fs.existsSync(largeFilePath)) {
    return fs.statSync(largeFilePath).size;
  }

  console.log("\n  Generating large G-code file (first run only)...");
  const TARGET_SIZE_BYTES = 1024 * 1024;

  const lines: string[] = [
    "; Auto-generated large G-code file for benchmarking",
    "; Size: ~1MB",
    "",
    "G21 ; mm mode",
    "G17 ; XY plane",
    "G90 ; absolute mode",
    "",
    "G0 X0 Y0 Z5 ; start position",
    "",
  ];

  let lineCount = 0;
  let currentSize = lines.join("\n").length;

  while (currentSize < TARGET_SIZE_BYTES) {
    const x = (lineCount % 100).toFixed(3);
    const y = (lineCount % 50).toFixed(3);
    const z = ((lineCount % 20) - 10).toFixed(3);
    const f = 500 + (lineCount % 500);

    if (lineCount % 10 === 0) {
      lines.push(`G0 X${x} Y${y} Z${z}`);
    } else if (lineCount % 7 === 0) {
      lines.push(`G1 X${x} Y${y} Z${z} F${f}`);
    } else {
      lines.push(`G1 X${x} Y${y} Z${z}`);
    }

    lineCount++;
    currentSize = lines.join("\n").length;
  }

  lines.push("");
  lines.push("G0 Z10 ; retract");
  lines.push("M2 ; end program");
  lines.push("");

  const content = lines.join("\n");
  fs.writeFileSync(largeFilePath, content);
  console.log(`  Generated ${formatBytes(content.length)} file`);

  return content.length;
}

// ============================================================================
// Tests
// ============================================================================

describe("performance", () => {
  let fileSize: number;

  beforeAll(() => {
    fileSize = ensureLargeFileExists();
    console.log(`\n  Using benchmark file: ${formatBytes(fileSize)}`);
  });

  it("should parse 1MB file and log performance metrics", async () => {
    // Measure memory before
    const memBefore = process.memoryUsage();

    // Measure parse time
    const startTime = performance.now();

    const result = await parseGCode(largeFilePath, { iniPath });

    const endTime = performance.now();
    const parseTime = endTime - startTime;

    // Measure memory after
    const memAfter = process.memoryUsage();

    // Calculate metrics
    const operationCount = result.operations.length;
    const opsPerSecond = (operationCount / (parseTime / 1000)).toFixed(0);
    const bytesPerSecond = (fileSize / (parseTime / 1000)).toFixed(0);
    const heapUsed = memAfter.heapUsed - memBefore.heapUsed;

    // Log performance report
    console.log("\n  ┌─────────────────────────────────────────────────────┐");
    console.log("  │           GCODE PARSER BENCHMARK RESULTS           │");
    console.log("  ├─────────────────────────────────────────────────────┤");
    console.log(`  │  File size:        ${formatBytes(fileSize).padEnd(30)}│`);
    console.log(`  │  Parse time:       ${formatDuration(parseTime).padEnd(30)}│`);
    console.log(`  │  Operations:       ${operationCount.toLocaleString().padEnd(30)}│`);
    console.log(`  │  Ops/second:       ${Number(opsPerSecond).toLocaleString().padEnd(30)}│`);
    console.log(`  │  Throughput:       ${formatBytes(Number(bytesPerSecond))}/s`.padEnd(54) + "│");
    console.log(`  │  Heap delta:       ${formatBytes(heapUsed).padEnd(30)}│`);
    console.log("  └─────────────────────────────────────────────────────┘\n");

    // Basic assertions to ensure parsing worked
    expect(result).toBeDefined();
    expect(result.operations.length).toBeGreaterThan(0);
    expect(result.extents).toBeDefined();

    // Log a simple summary line for CI/test output
    console.log(
      `  Parsed ${operationCount.toLocaleString()} operations in ${formatDuration(parseTime)} (${Number(opsPerSecond).toLocaleString()} ops/sec)`
    );
  }, 120000); // 2 minute timeout for large file

  it("should track progress during large file parsing", async () => {
    let progressCallCount = 0;
    let lastPercent = 0;

    await parseGCode(largeFilePath, {
      iniPath,
      onProgress: (progress) => {
        progressCallCount++;
        lastPercent = progress.percent;
      },
    });

    console.log(`  Progress callback called ${progressCallCount} times`);
    console.log(`  Final percent: ${lastPercent}%`);

    expect(progressCallCount).toBeGreaterThan(0);
    expect(lastPercent).toBe(100);
  }, 120000);

  it("should respect custom progressUpdates setting", async () => {
    let progressCallCount = 0;

    await parseGCode(largeFilePath, {
      iniPath,
      progressUpdates: 10, // Request ~10 updates
      onProgress: () => {
        progressCallCount++;
      },
    });

    console.log(`  With progressUpdates=10: ${progressCallCount} callbacks`);

    // Should be close to 10 (plus final 100% callback)
    expect(progressCallCount).toBeGreaterThanOrEqual(5);
    expect(progressCallCount).toBeLessThanOrEqual(20);
  }, 120000);

  it("should disable progress callbacks when progressUpdates=0", async () => {
    let progressCallCount = 0;

    await parseGCode(largeFilePath, {
      iniPath,
      progressUpdates: 0,
      onProgress: () => {
        progressCallCount++;
      },
    });

    console.log(`  With progressUpdates=0: ${progressCallCount} callbacks`);

    // Should only get the final 100% callback
    expect(progressCallCount).toBe(1);
  }, 120000);
});
