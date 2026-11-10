/** Jest: jest-expo preset (babel-preset-expo) so the same TS sources run in Node with fakes, no device. */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '^@attendance/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  clearMocks: true,
};
