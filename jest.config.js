/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['dist'],
  transform: {
    '^.+\\.[tj]s$': '@swc/jest',
  },
  transformIgnorePatterns: [
    '<rootDir>/node_modules/(?!(@noble/curves|@scure/base|@scure/btc-signer|micro-packed))',
  ],
};

export default config;
