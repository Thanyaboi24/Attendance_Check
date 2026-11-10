/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json'}] },
  globalSetup: '<rootDir>/test/setup/global-setup.mjs',
  globalTeardown: '<rootDir>/test/setup/global-teardown.mjs',
  setupFiles: ['<rootDir>/test/setup/env.ts'],
  testTimeout: 60_000,
};
