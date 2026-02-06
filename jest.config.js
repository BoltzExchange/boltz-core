module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['json', 'js', 'ts', 'd.ts', 'node'],

  modulePathIgnorePatterns: ['<rootDir>/solidity-lib/'],
  testPathIgnorePatterns: ['<rootDir>/solidity-lib/'],
  watchPathIgnorePatterns: ['<rootDir>/solidity-lib/'],
};
