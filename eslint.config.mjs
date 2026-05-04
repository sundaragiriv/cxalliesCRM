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

  // Data-layer override: schemas reference each other's tables for FKs, seed
  // scripts write directly to schemas, and the auth infrastructure (Better Auth
  // adapter + permission checks) needs schema access to wire the auth instance.
  // The cross-module rule still applies to all application code (api/actions/components/module-lib).
  {
    files: [
      'apps/web/src/modules/*/schema.ts',
      'apps/web/src/db/shared-tables.ts',
      'apps/web/src/db/schema.ts',
      'apps/web/src/db/seed/**/*.ts',
      'apps/web/src/lib/auth.ts',
      'apps/web/src/lib/auth/**/*.ts',
      'apps/web/src/lib/audit/**/*.ts',
      // Email is a cross-cutting concern: the resolver in
      // `lib/email/from-org.ts` reads the `organizations` row to produce
      // the From identity (per ADR-0007). Same rationale as `lib/auth/`
      // and `lib/audit/` — top-level libs that bridge multiple modules
      // and need schema access.
      'apps/web/src/lib/email/**/*.ts',
      // Module API files cross-import other modules' schemas to satisfy
      // tRPC's read joins (e.g., finance.expenses.list joins parties for the
      // payee name). The cross-module rule still blocks api → another
      // module's actions/components/lib.
      'apps/web/src/modules/*/api/**/*.ts',
      'apps/web/src/modules/*/actions/**/*.ts',
      // App routes are the integration layer per architecture §2.2 — pages,
      // layouts, error/loading boundaries render the module's components and
      // call its actions. Cross-module access from inside a module still goes
      // through api/actions.
      'apps/web/src/app/**/*.{ts,tsx}',
      // Tests legitimately import internal module helpers (lib/, schema)
      // to verify them in isolation. Application code is still bound by
      // the rule.
      'apps/web/tests/**/*.{ts,tsx}',
      // Verification scripts (one-off end-to-end checks) reach into
      // internal helpers like tests do. Same allowlist treatment.
      'apps/web/scripts/**/*.ts',
      // The tax module's lib/ legitimately reads cross-module reference
      // data (organizations.defaultFilingStatus, .homeState) to compute
      // per-org estimates. This is the one finance lib subtree that needs
      // sibling-schema access; broader lib/ stays locked.
      'apps/web/src/modules/*/lib/tax/**/*.ts',
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
