module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Optional: collect coverage
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
};
