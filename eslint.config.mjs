import { FlatCompat } from '@eslint/eslintrc'
import tseslint from 'typescript-eslint'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const crossModuleImportRule = [
  'error',
  {
    patterns: [
      {
        group: [
          '**/modules/*/components/**',
          '**/modules/*/lib/**',
          '**/modules/*/schema*',
        ],
        message:
          "Cross-module imports of components/, lib/, or schema.ts are forbidden. Use the module's api/ or actions/.",
      },
    ],
  },
]

export default [
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/next-env.d.ts',
    ],
  },

  // Next + TS rules scoped to the web app only
  ...compat
    .extends('next/core-web-vitals', 'next/typescript')
    .map((config) => ({
      ...config,
      files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs}'],
    })),

  // Web app-specific rules
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': crossModuleImportRule,
    },
  },

  // Data-layer override: schemas reference each other's tables for FKs, and
  // seed scripts write directly to schemas. The cross-module rule still applies
  // to all application code (api/actions/components/lib).
  {
    files: [
      'apps/web/src/modules/*/schema.ts',
      'apps/web/src/db/shared-tables.ts',
      'apps/web/src/db/schema.ts',
      'apps/web/src/db/seed/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // Shared package: plain TS, no Next plugin
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['packages/**/*.{ts,tsx}'],
  })),
  {
    files: ['packages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': crossModuleImportRule,
    },
  },
]
