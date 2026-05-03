/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    // Redirect the real vscode module to our hand-rolled mock
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
    // Resolve codeloom directly from its source dist (avoids node_modules dependency)
    '^codeloom/(.*)$': '<rootDir>/../codeloom/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        strict: false,
        esModuleInterop: true,
        module: 'commonjs',
        target: 'ES2020',
        skipLibCheck: true,
        // Tell TypeScript where to resolve codeloom/* imports
        baseUrl: '.',
        paths: {
          'codeloom/*': ['../codeloom/*'],
        },
      },
    }],
  },
  // Collect coverage from source files only
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/__mocks__/**'],
};
