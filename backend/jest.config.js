/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  projects: [
    { displayName: 'unidade', testEnvironment: 'node', testMatch: ['<rootDir>/src/**/*.spec.ts'], transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] } },
    { displayName: 'api', testEnvironment: 'node', testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'], transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] } },
  ],
};
