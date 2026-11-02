/** Root Jest config: scoring engine + Supabase (RLS, Edge Function handlers). The app is checked by tsc/eslint. */
const tsJest = ['ts-jest', { tsconfig: { allowJs: true, esModuleInterop: true, resolveJsonModule: true, isolatedModules: true }, diagnostics: false }];

module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\.(t|j)sx?$': tsJest },
  testMatch: ['<rootDir>/packages/*/test/**/*.test.ts', '<rootDir>/supabase/tests/**/*.test.ts'],
  moduleNameMapper: { '^@watcher/scoring$': '<rootDir>/packages/scoring/src/index.ts' },
};
