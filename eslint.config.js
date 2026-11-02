// Flat ESLint config for the whole monorepo.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');
const globals = require('globals');

module.exports = defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      'app/android/**',
      'app/ios/**',
      'coverage/**',
      // generated copy of packages/scoring for the Edge Runtime
      'supabase/functions/_shared/scoring/**',
    ],
  },

  // Expo app
  // Expo's entries ship their own **/* globs; re-root them under app/ so they don't apply to the backend.
  ...expoConfig.map((c) => ({
    ...c,
    files: (c.files ?? ['**/*.{js,jsx,ts,tsx}']).map((f) => (typeof f === 'string' ? `app/${f}` : f)),
  })),
  {
    files: ['app/**/*.{ts,tsx}'],
    settings: { 'import/resolver': { typescript: { project: 'app/tsconfig.json' } } },
    rules: {
      'import/no-unresolved': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Shared engine, Edge Functions, tests and scripts
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['packages/**/*.ts', 'supabase/**/*.ts'] })),
  {
    files: ['packages/**/*.ts', 'supabase/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.js', 'app/*.js'],
    languageOptions: { globals: globals.node, sourceType: 'module' },
  },
  {
    files: ['*.js', 'app/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
]);
