module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/variance-*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  globals: {
    'ts-jest': { diagnostics: false },
  },
};
