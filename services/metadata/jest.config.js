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
    forceExit: true,
    setupFiles: ['<rootDir>/tests/setup.js'],
    moduleNameMapper: {
      '.*shared/db/redis(.*)$': '<rootDir>/../../shared/db/redis$1',
      '.*shared/db(.*)$':       '<rootDir>/../../shared/db$1',
    },
  };