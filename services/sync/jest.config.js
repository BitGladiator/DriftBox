module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    collectCoverageFrom: [
      'socket/**/*.js',
      'consumer/**/*.js',
    ],
    coverageThreshold: {
      global: { lines: 80, functions: 80, branches: 70 },
    },
    testTimeout: 15000,
    verbose: true,
    forceExit: true,
    setupFiles: ['<rootDir>/tests/setup.js'],
    moduleNameMapper: {
      '.*shared/rabbitmq(.*)$': '<rootDir>/../../shared/rabbitmq$1',
    },
  };