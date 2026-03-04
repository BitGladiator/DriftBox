module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'routes/**/*.js',
  ],
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 70 },
  },
  testTimeout: 15000,
  verbose: true,
  // Force Jest to exit after all tests complete, cleaning up any leaked handles
  forceExit: true,
  // Runs before test framework is installed — sets env vars before ANY module loads
  setupFiles: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '.*shared/db(.*)$': '<rootDir>/../../shared/db$1',
  },
};