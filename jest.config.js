module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': '@swc/jest',
  },
  moduleFileExtensions: ['json', 'js', 'ts', 'd.ts', 'node'],
};
