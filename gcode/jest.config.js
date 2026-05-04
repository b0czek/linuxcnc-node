/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  globalSetup: "<rootDir>/tests/setupLinuxCNC.js",
  globalTeardown: "<rootDir>/tests/teardownLinuxCNC.js",
  setupFiles: ["<rootDir>/tests/setupLinuxCNCEnv.js"],
  moduleFileExtensions: ["ts", "js", "json", "node"],
  collectCoverageFrom: ["src/ts/**/*.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  verbose: true,
  testTimeout: 30000,
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        types: ["node", "jest"],
      },
    }],
  },
};
