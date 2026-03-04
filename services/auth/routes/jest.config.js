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
  };