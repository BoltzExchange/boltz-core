/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['dist', 'solidity-lib'],
  transform: {
    '^.+\\.[tj]s$': '@swc/jest',
  },
  transformIgnorePatterns: [
    '<rootDir>/node_modules/(?!(@noble|@scure|micro-packed))',
  ],
  resolver: '<rootDir>/jest.resolver.cjs',
};

export default config;
