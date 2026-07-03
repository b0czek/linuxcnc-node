module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        isolatedModules: true,
        types: ['node', 'jest'],
      },
    }],
  },
}
