# CXAllies — Conventions

> Coding standards for **CXAllies — Intelligent AI/ERP Solutions**, a product of Varahi Group LLC.
> This document is what Claude Code reads at the start of every session and what code review enforces. It is opinionated by design — consistency beats cleverness, and a single-developer codebase with strict conventions ages better than a multi-developer codebase with loose ones.
> Architectural commitments live in [`01-architecture.md`](./01-architecture.md). Vocabulary lives in [`04-glossary.md`](./04-glossary.md). Data model lives in [`02-data-model.md`](./02-data-model.md). ADRs live in [`adr/`](./adr/).

---

## 0. The design center

Before any rule, the design center: **CXAllies serves \$300K–\$5M companies. Simplicity, ease of use, eye-catchy UI, ease of doing things are the priority.**

This is not aspirational copy. It is a constraint that resolves ambiguity in every decision below. When two patterns are equally correct technically, pick the one that's simpler for the user. When a feature can be simplified at the cost of a power-user setting, simplify and bury the setting.

Three operational tests every PR must pass:

1. **Five-minute test.** A new user, never trained, can complete the primary task on this screen in under five minutes.
2. **Default-good test.** If the user changes nothing, do they get a working result? Defaults must be sensible.
3. **One-way test.** Is there one obvious way to do this thing on this screen, or three? Three is too many.

If any of these fail, the simplification work is part of the ticket, not a follow-up.

---

## 1. TypeScript

### 1.1 Strict mode is on

`tsconfig.json` has:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true
  }
}
```

These are not optional. Every PR runs `tsc --noEmit` in CI. Type errors block merge.

### 1.2 No `any`

`any` is forbidden. Use `unknown` and narrow with type guards or zod parsing. The one exception is interop with libraries that genuinely have no types (rare in our stack); those are isolated to a single adapter file with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` and a comment explaining the library.

`@ts-ignore` is forbidden. `@ts-expect-error` is permitted only with an inline comment explaining the reason and a TODO if the underlying issue is fixable.

### 1.3 Prefer `type` over `interface`

`type` aliases compose better and prevent accidental declaration merging. Use `interface` only when declaration merging is genuinely needed (rare — almost never in our codebase).

### 1.4 No default exports

Default exports break refactoring tools and make rename inconsistent. Two exceptions: Next.js page and layout files require default export by framework convention.

### 1.5 Inferred types from zod

Every schema we accept from outside the system (form input, API request, env var, webhook payload) is parsed by zod. Types come from inference:

```typescript
const createExpenseSchema = z.object({
  amountCents: z.number().int().positive(),
  description: z.string().min(1).max(500),
  businessLineId: z.string().uuid(),
  // ...
});

type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
```

Never define a TypeScript type and a zod schema separately for the same shape. Pick zod, infer the type.

### 1.6 No unused exports

ESLint enforces `unused-imports/no-unused-imports`. Unused exports are caught by `tsc` indirectly when used with `noUnusedLocals` and `noUnusedParameters`. Both flags on.

---

## 2. File and directory structure

### 2.1 Module shape (immutable)

Every business module under `src/modules/{name}/` has exactly this shape:

```
src/modules/{name}/
├── api/             # tRPC router procedures (PUBLIC)
├── actions/         # Server Action functions (PUBLIC)
├── events/          # Event emitters and subscribers (PUBLIC)
├── types.ts         # Exported TypeScript types (PUBLIC)
├── components/      # React components (INTERNAL)
├── lib/             # Utility functions (INTERNAL)
└── schema.ts        # Drizzle table definitions (INTERNAL)
```

A module may add subdirectories within `lib/`, `components/`, or `events/` as it grows. The seven top-level entries are fixed.

### 2.2 Public vs internal

| Directory | Importable from another module? | Notes |
|---|---|---|
| `api/` | Yes | Public read interface |
| `actions/` | Yes | Public write interface |
| `events/` | Yes | Public event bus |
| `types.ts` | Yes | Public types only |
| `components/` | **No** | Module-private UI |
| `lib/` | **No** | Module-private utilities |
| `schema.ts` | **No** | Tables are module-owned; cross-module access via `api/` |

Cross-module imports of internal directories fail CI via ESLint:

```js
// .eslintrc.js
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '**/modules/*/components/**',
            '**/modules/*/lib/**',
            '**/modules/*/schema*'
          ],
          message: 'Cross-module imports of components/, lib/, or schema.ts are forbidden. Use the module\'s api/ or actions/.'
        }
      ]
    }]
  }
}
```

### 2.3 File naming

| What | Convention | Example |
|---|---|---|
| TypeScript files | `kebab-case.ts` | `create-expense.ts`, `parse-receipt.ts` |
| React components | `PascalCase.tsx` | `ExpenseForm.tsx`, `ProjectHealthTile.tsx` |
| Test files | `{file}.test.ts` next to the file | `create-expense.test.ts` |
| Type-only files | `types.ts` | (singular, public-facing per module) |
| Index files | Avoid `index.ts` re-exports except at module public boundaries | |

**Exception — shadcn/ui primitives.** Files vendored into `src/components/ui/` via the shadcn CLI keep the upstream lowercase-kebab convention (`button.tsx`, `dropdown-menu.tsx`) so `pnpm dlx shadcn@latest add ...` writes consistent files. The PascalCase rule applies to first-party React components everywhere else (e.g. `src/modules/{name}/components/ExpenseForm.tsx`).

### 2.4 Where things live (top-level)

```
src/
├── app/                       # Next.js App Router
│   ├── (authed)/              # Authenticated routes
│   ├── (public)/              # Public routes (login, marketing)
│   ├── api/                   # API routes (tRPC, webhooks)
│   └── layout.tsx
├── modules/                   # All business modules
│   └── {name}/                # See §2.1
├── components/                # Cross-module UI primitives only
│   └── ui/                    # shadcn/ui components
├── lib/                       # Cross-module utilities only
│   ├── env.ts                 # Validated env vars
│   ├── trpc.ts                # tRPC client + server setup
│   ├── auth.ts                # Better Auth config
│   ├── currency.ts            # Money formatting
│   ├── dates.ts               # Date formatting + parsing
│   ├── audit.ts               # Audit log middleware
│   └── ...
├── db/                        # Drizzle setup
│   ├── client.ts              # Drizzle client singleton
│   ├── shared.ts              # Shared column primitives
│   ├── enums.ts               # Postgres enums
│   ├── shared-tables.ts       # activities, audit_log, exchange_rates
│   └── schema.ts              # Re-exports all module schemas
└── styles/
    └── globals.css            # Tailwind + global tokens
```

Anything in `src/lib/` must be genuinely cross-module. If it's used by one module, it lives in that module's `lib/`.

---

## 3. Database

### 3.1 Drizzle for everything

All tables defined in Drizzle TypeScript per ADR-0002. No raw SQL except in:
- Migration files (generated then edited if needed)
- Reporting queries that need window functions, CTEs, or specific query plans

When raw SQL is unavoidable, type the result via zod and isolate the SQL to a single function in the module's `lib/`.

### 3.2 Naming

Per data model §1.5:

| What | Convention | Example |
|---|---|---|
| Table names | `module_entity_plural` | `finance_expense_entries` |
| Shared tables | `entity_plural` (no prefix) | `parties`, `activities`, `audit_log`, `users` |
| Columns | `snake_case` | `business_line_id`, `amount_cents` |
| FK columns | `referenced_entity_singular_id` | `party_id`, `chart_of_accounts_id` |
| Booleans | `is_X`, `has_X`, `was_X` | `is_billable`, `has_2fa_enabled` |
| Money | `X_cents` (always `bigint`) | `amount_cents`, `total_cents` |

### 3.3 Standard columns on every table

Every primary entity has:
- `id uuid PK` (defaulted via `gen_random_uuid()`)
- `organization_id uuid NOT NULL` FK to `organizations.id`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()` (trigger-updated)
- `deleted_at timestamptz NULL` (soft delete)

Append-only tables (audit_log, ai_runs, journal_lines) omit `updated_at` and `deleted_at`. Junction tables omit `deleted_at`.

### 3.4 Money

- Stored as `bigint` cents in columns suffixed `_cents`
- Paired with `currency_code char(3)` defaulting to `'USD'`
- No floats anywhere — multiplying by 100 in code is the only way money becomes a float, and even that is forbidden (use `* 100 | 0` if you must, or a money library)
- Display formatting via `formatCurrency(cents, currencyCode)` in `lib/currency.ts`

### 3.5 Dates

- Stored as `timestamptz` (UTC) or `date` for date-only fields
- API serializes to ISO 8601 strings
- UI parses to `Date` and displays in user's timezone (default `America/New_York`)
- `lib/dates.ts` provides `formatDate`, `formatDateTime`, `parseUserInput` helpers
- Never compare dates as strings — always parse first

### 3.6 Soft deletes

- Default list queries filter `WHERE deleted_at IS NULL` via the `active(table)` helper:

```typescript
// src/lib/db/active.ts
import { isNull } from 'drizzle-orm';

export const active = (col: { deletedAt: any }) => isNull(col.deletedAt);
```

- Including soft-deleted rows requires explicit comment: `// includes soft-deleted intentionally — recovery flow`
- Hard deletes are reserved for compliance scripts (DSAR), 30-day file cleanup, and junction tables

### 3.7 Foreign keys

- Always declared with `.references(() => table.column)` in Drizzle
- `onDelete` always specified explicitly:
  - `RESTRICT` (default for business-critical references)
  - `CASCADE` (ownership relationships only)
  - `SET NULL` (soft references where the parent's removal shouldn't cascade)

- Cross-module FKs require a PR comment explaining the dependency. Reviewer confirms it's necessary.

### 3.8 Indexes

Every table ships with:
- Primary key (UUID btree)
- `(organization_id, created_at)` composite for tenant-scoped time queries
- An index on every FK column
- An index on every column used in `WHERE`, `ORDER BY`, or `GROUP BY` for that table's known query patterns
- Partial indexes for status filters where applicable (per data model §15.2)

Unused indexes are pruned in Phase 4 cleanup pass. Phase 1 errs on the side of more indexes — write performance is fine for our volume.

### 3.9 Migrations

Workflow:

1. Edit `src/modules/{name}/schema.ts`
2. Run `pnpm db:generate --name describe_change`
3. Review the generated SQL in `drizzle/migrations/`
4. Edit the file if data backfills, custom indexes, or triggers are needed
5. Run `pnpm db:migrate` locally to apply
6. Commit schema change and migration file together
7. CI applies migrations on deploy

Migration files are named `{timestamp}_{module}_{description}.sql`. Drizzle generates the timestamp; you write the rest.

Never edit a migration that's been merged to `main`. Forward-only. To fix a mistake, write a new migration that corrects it.

### 3.10 Seed data

Seed data lives in `src/db/seed/{name}.ts` and runs via `pnpm db:seed`. Phase 1 seeds:
- One `organizations` row (Varahi Group LLC)
- Brands (CXAllies, Pravara.ai)
- Business Lines (Consulting, Matrimony, Websites, YouTube)
- Roles (Owner, Admin, Bookkeeper, Sales, Support Agent)
- Chart of Accounts (26 accounts, type-prefixed numbering)
- Default deal stages per business line
- Tax rates (federal + NC, 2026)
- Initial users (Venkata as Owner, Poornima placeholder)

Seed is idempotent — running twice produces the same DB state.

---

## 4. API layer

### 4.1 tRPC for reads, Server Actions for writes

| Need | Use |
|---|---|
| Read a list, fetch a record, search, filter | tRPC procedure (`*.list`, `*.get`, `*.search`) |
| Create, update, delete a record | Server Action |
| Side effects from form submission | Server Action |
| Cross-module event emission | Server Action |
| Real-time subscriptions | Not Phase 1 — defer to Phase 5 if needed |

Server Actions colocate with the route that triggers them when possible (`app/(authed)/finance/expenses/_actions.ts`). Module-level actions used by multiple routes live in `src/modules/{name}/actions/`.

### 4.2 tRPC procedure naming

Dot notation: `{module}.{entity}.{verb}`. Verbs: `list`, `get`, `search`, `count`.

```typescript
// src/modules/finance/api/router.ts
export const financeRouter = router({
  expenses: router({
    list: publicProcedure.input(...).query(...),
    get: publicProcedure.input(...).query(...),
    search: publicProcedure.input(...).query(...),
  }),
  // ...
});
```

### 4.3 Server Action naming

Verb-first: `createInvoice`, `markInvoicePaid`, `submitTimesheet`. Actions live in `actions/` files and are exported as named functions.

### 4.4 Input validation

Every tRPC procedure and Server Action validates input with zod. No exceptions.

```typescript
const input = z.object({
  expenseId: z.string().uuid(),
  accountId: z.string().uuid(),
}).parse(rawInput);
```

### 4.5 Return shape

Server Actions return:

```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };
```

`fieldErrors` is set when the failure is a validation error tied to specific form fields. UI uses it to display inline errors in `react-hook-form`.

tRPC procedures return data directly and throw `TRPCError` for failures. The shape is enforced by tRPC's error formatter.

### 4.6 Pagination

Default page size is 50. Maximum is 200. Cursor-based pagination is required for any list that may exceed 1000 rows. Offset pagination is permitted only for small fixed-size lists (e.g., the 5 business lines).

```typescript
const list = publicProcedure
  .input(z.object({
    cursor: z.string().uuid().optional(),
    limit: z.number().min(1).max(200).default(50),
  }))
  .query(async ({ input, ctx }) => {
    const items = await ctx.db.query.expenseEntries.findMany({
      where: ...,
      orderBy: [desc(expenseEntries.entryDate), desc(expenseEntries.id)],
      limit: input.limit + 1,
    });

    const nextCursor = items.length > input.limit ? items[input.limit].id : null;
    return {
      items: items.slice(0, input.limit),
      nextCursor,
    };
  });
```

### 4.7 Authorization

Every tRPC procedure and Server Action declares its authorization requirement via middleware:

```typescript
const list = procedureWithAuth({ module: 'finance', action: 'read' })
  .input(...)
  .query(...);
```

`procedureWithAuth` checks the calling user's roles against a permissions matrix in `src/lib/auth/permissions.ts`. Violations throw 403.

### 4.8 Audit middleware

Every Server Action wraps its body in `withAudit` which captures before/after state and writes to `audit_log`. Wrapping is automatic via a higher-order function:

```typescript
export const createExpense = withAudit('finance_expense_entries', 'insert', async (input, ctx) => {
  // ... mutation
  return { success: true, data: created };
});
```

Forgotten audit wrapping fails CI via a custom ESLint rule.

---

## 5. Forms

### 5.1 react-hook-form + zod resolver everywhere

Every form uses:

```typescript
const form = useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema),
  defaultValues: { ... },
});
```

No exceptions. shadcn/ui `<Form>` components wrap this pattern.

### 5.2 Submission

Forms submit to Server Actions:

```typescript
const onSubmit = async (data: FormData) => {
  const result = await createExpense(data);
  if (!result.success) {
    if (result.fieldErrors) {
      Object.entries(result.fieldErrors).forEach(([field, msg]) =>
        form.setError(field as any, { message: msg })
      );
    } else {
      toast.error(result.error);
    }
    return;
  }
  toast.success('Expense saved');
  router.push(`/finance/expenses/${result.data.id}`);
};
```

This pattern is identical across forms. Encapsulate it in a `useFormWithAction` hook in `src/lib/forms/`.

### 5.3 Defaults are mandatory

Per the design center: every form ships with sensible defaults. An empty expense form has:
- Today's date pre-filled
- Default business line (most-used in last 30 days)
- Currency = USD
- Payment source = most-used by this user

Defaults come from a `getFormDefaults` query specific to each form. UI never shows empty fields when a sensible default exists.

### 5.4 Field-level guidance

Forms with more than three fields show inline help text under each non-obvious field. Tooltips are forbidden for primary guidance — text below the field is required. (Tooltips are fine for supplementary info.)

---

## 6. UI

### 6.1 shadcn/ui as the only UI library

No Material UI, no Chakra, no Mantine, no Ant Design, no Radix-without-shadcn. shadcn/ui ships components into `src/components/ui/`; we own them and modify them when needed.

Composition over re-styling: when a shadcn component doesn't fit, build a wrapper that composes shadcn primitives. Never fork a primitive.

### 6.2 Tailwind for all styling

No CSS modules, no styled-components, no emotion. Tailwind classes only.

Exceptions:
- `globals.css` for CSS variables (design tokens) and Tailwind directives
- `<style jsx>` blocks for genuinely dynamic styles (rare)

### 6.3 Server Components by default

Every component is a Server Component unless it needs:
- `useState`, `useReducer`, `useRef` (mutable client state)
- `useEffect` (lifecycle)
- Event handlers attached to DOM
- Browser APIs (`window`, `document`, `localStorage`)

Client Components mark themselves with `"use client"` at the top.

Default to Server Components even when a Client Component would feel natural. The performance benefit is real.

### 6.4 Suspense and streaming

Every async data fetch in a Server Component is wrapped in `<Suspense fallback={<Skeleton />}>`. The page should render the chrome instantly and stream data into place.

### 6.5 Loading states

Every list, table, and detail view ships with a skeleton loading state. shadcn provides `<Skeleton>`. Use it. Loading states are not optional polish.

### 6.6 Empty states

Every list ships with an empty state that:
1. Explains what would normally appear here
2. Has a primary action button to populate it
3. Optionally shows an illustration (Phase 1 ships text-only empty states; illustrations Phase 2)

Never ship a blank list with no explanation.

### 6.7 Error states

Every page is wrapped in an error boundary. Errors render a friendly message + "Try again" button + (in dev) the stack trace.

Toast notifications for transient errors (form failure, save failure). Inline errors for field-level issues. Modal errors for destructive failures (delete confirmation that hits a constraint).

### 6.8 Accessibility

- Every interactive element is keyboard-reachable
- Focus rings are visible (Tailwind's `focus-visible:` utilities)
- Color contrast meets WCAG AA (4.5:1 for body text, 3:1 for large)
- Forms have proper labels (shadcn handles this if you use `<FormField>`)
- Icons used as buttons have aria-labels

### 6.9 Mobile responsive

Per the architecture: PWA from day one. Every page works at 375px width. Tested at 375, 768, 1024, 1440.

The data table pattern at mobile width is: collapse to cards, not horizontal scroll. shadcn's table component supports this with a custom cell layout.

### 6.10 Visual polish

The "eye-catchy UI" mandate translates to:
- Generous whitespace (Tailwind `p-6` minimum on cards, `space-y-6` between sections)
- Clear visual hierarchy via type scale (`text-3xl` headings, `text-sm` body)
- One primary accent color (defined in CSS vars; default is shadcn's slate-with-blue accent; configurable per brand)
- Subtle shadows (`shadow-sm`, `shadow-md`) over heavy borders
- Consistent radius (`rounded-md` on inputs, `rounded-lg` on cards)
- Animation on state changes (Tailwind `transition-all duration-200`)

This is non-negotiable Phase 1 quality. "Functional but ugly" is failure.

---

## 7. Naming (code level)

### 7.1 Variables and functions

| What | Convention |
|---|---|
| Variables | `camelCase` |
| Functions | `camelCase` |
| Async functions | Prefix with verb: `fetchExpenses`, `createInvoice` |
| React components | `PascalCase` |
| React hooks | `use` prefix: `useFormWithAction` |
| Constants | `SCREAMING_SNAKE_CASE` only for true constants (env-shaped values) |
| Types | `PascalCase` |
| Type parameters | Single uppercase letter or `PascalCase` (`T`, `TInput`, `TResult`) |

### 7.2 Boolean variables

Same as DB columns: `is_X`, `has_X`, `was_X`, `should_X`, `can_X`. Never bare nouns (`open` vs `isOpen`).

### 7.3 IDs

A variable holding an ID is named `{thing}Id`, not `{thing}` and not `id`. The bare `id` is reserved for the current entity:

```typescript
// good
const expenseId = '...';
const partyId = '...';

// bad — ambiguous
const expense = '...';  // is this a string ID or an object?
```

### 7.4 Money

A variable holding cents is named `{name}Cents`. Never bare amount — too ambiguous.

```typescript
const amountCents = 1234;       // $12.34
const formattedAmount = '$12.34';
```

---

## 8. Events

### 8.1 Naming

`{module}.{entity}.{verb_past_tense}`. Locked.

```typescript
emit('finance.expense.created', { expenseId });
emit('billing.invoice.paid', { invoiceId, paidCents });
emit('crm.deal.stage_changed', { dealId, fromStageId, toStageId });
```

### 8.2 Schemas

Every event has a zod schema in `src/modules/{name}/events/schemas.ts`:

```typescript
export const expenseCreatedSchema = z.object({
  v: z.literal(1),
  expenseId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export type ExpenseCreatedPayload = z.infer<typeof expenseCreatedSchema>;
```

The `v` field is for schema versioning. Bump on breaking changes.

### 8.3 Synchronous vs durable

Two delivery modes (per architecture §4.2):

- **Synchronous in-process** (same DB transaction) for: writing to `activities`, writing to `audit_log`. Use these via direct function calls in actions, not the event bus.
- **Durable async** via pg-boss for: sending email, calling AI providers, recomputing rollups, sending webhooks.

Default to durable async unless you specifically need transactional integrity with the source mutation.

### 8.4 Subscriber location

Subscribers live in `src/modules/{name}/events/subscribers/`. Each subscriber is one file, named `{verb}{Entity}.ts`:

```
src/modules/ai/events/subscribers/
├── categorizeExpense.ts        # subscribes to finance.expense.created
├── draftTicketReply.ts         # subscribes to support.ticket.created (Phase 5)
└── ...
```

A subscriber may call other modules' public `api/` and `actions/`. It must not import internal directories.

---

## 9. AI

### 9.1 All LLM calls go through the `ai` module

Direct imports of `@anthropic-ai/sdk` or `openai` outside `src/modules/ai/lib/providers/` fail CI via ESLint:

```js
{
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        {
          name: '@anthropic-ai/sdk',
          message: 'Import only via src/modules/ai/lib/providers/. Use ai.run() in your subscriber.'
        },
        {
          name: 'openai',
          message: 'Import only via src/modules/ai/lib/providers/. Use ai.run() in your subscriber.'
        }
      ]
    }]
  }
}
```

### 9.2 AI never writes business data

Per ADR-0003 §3.4. AI subscribers create `ai_suggestions` rows only. The user (or, Phase 5+, an auto-accept rule) accepts the suggestion, which triggers a normal Server Action mutation.

A code review hard-flags any AI subscriber that mutates business tables directly.

### 9.3 Cost tracking

Every AI run logs to `ai_runs` with cost in cents. The `ai/lib/budget.ts` enforcement runs before every call. No exceptions.

---

## 10. Performance

### 10.1 Targets

Per architecture §10:

- Page TTI < 2s
- API p95 < 300ms
- Dashboard render < 1s with 12 months of data
- Project Health tile < 500ms

### 10.2 Practices

- No N+1 queries. Drizzle's relational queries API issues one JOIN — use it for fetch-with-relations.
- No unbounded queries. Every list has a `limit`.
- Heavy aggregations move to a pg-boss job that writes to `dashboard_tiles.config.cached_data` — Phase 4 if needed; Phase 1 ships direct queries.
- Image optimization via Next.js `<Image>` only. Never `<img>`.
- Bundle analysis: `pnpm analyze` runs `@next/bundle-analyzer`. Check before merging if the bundle grew.

### 10.3 Caching

- React Server Components are cached by Next.js automatically based on data fetches.
- tRPC queries are cached by React Query on the client (default stale time: 30 seconds).
- Server-side caching for expensive computations: `unstable_cache` from Next.js with explicit invalidation tags.
- No Redis in Phase 1. If Postgres CPU exceeds 60% sustained, revisit.

### 10.4 Database performance

- Run `EXPLAIN ANALYZE` on any query that feels slow before optimizing.
- `pg_stat_statements` is enabled in production. Top 20 slowest queries are reviewed monthly.
- New indexes require a justification in the PR ("supports the project health tile query").

---

## 11. Testing

### 11.1 Vitest for business logic

Every function in `actions/`, `events/subscribers/`, and any non-trivial helper in `lib/` has a Vitest test. Aim for:
- Happy path coverage
- At least one error case
- Edge cases for money math, date math, and tax calculations

UI component tests are not required in Phase 1. shadcn primitives are pre-tested; our compositions of them are visually verified.

### 11.2 Playwright for critical user flows

E2E tests cover the flows that, if broken, kill the product:
- Login + 2FA setup
- Create expense + categorize
- Submit timesheet + approve
- Generate invoice from approved timesheet
- Record payment
- View dashboard

Phase 1 ships ~10 Playwright tests. They run in CI on every PR.

### 11.3 Test data

Tests use a separate Postgres database (`cxallies_test`). Each test wraps in a transaction that rolls back. Seed data is loaded once at the start of the test suite.

### 11.4 Coverage targets

- Business logic: 70%+
- UI components: 0% required (visually verified)
- Critical flows: 100% via Playwright

CI fails if business-logic coverage drops below 70%.

---

## 12. Git and commits

### 12.1 Branch strategy

`main` is always deployable. Feature work happens on branches:

```
feat/finance-expense-form
fix/invoice-pdf-margin-bug
refactor/extract-money-helpers
chore/upgrade-drizzle
```

Branches are short-lived (1-3 days). Long-running branches accumulate conflicts and rot.

### 12.2 Conventional commits

Commits follow the conventional commits spec:

```
feat(finance): add expense report submission flow
fix(billing): correct invoice line tax calculation
refactor(crm): extract deal stage helpers
chore(deps): upgrade Drizzle to 0.30.4
docs(adr): add ADR-0005 inbound email decision
test(finance): add expense categorization edge cases
```

The scope (in parens) is the module name. Multi-module changes use `(*)` for scope.

### 12.3 PR titles

Mirror the commit message format. The PR description includes:
- What changed
- Why
- Screenshots if UI changed
- Test plan (or "covered by automated tests")
- Any new dependencies or env vars
- Cross-module FK additions (if any)

### 12.4 Squash on merge

PRs squash-merge into `main`. The squash commit message is the PR title plus the body. This keeps `main` history clean and bisectable.

### 12.5 Force push

Force-push to feature branches is fine. Force-push to `main` is forbidden.

---

## 13. Forbidden patterns

A non-exhaustive list of things that fail code review:

- Storing money as a float
- Bypassing zod validation on input
- Cross-module imports outside the public API
- `any` type
- `@ts-ignore`
- Default exports outside Next.js page/layout files
- New dependencies without an ADR or explicit approval
- New env vars without entry in `.env.example` and `lib/env.ts`
- Hardcoding business line names anywhere in code
- Hardcoding USD anywhere outside the default value declaration
- N+1 queries when a JOIN would do
- Unbounded list queries (`limit` is mandatory)
- AI calls outside the `ai` module
- AI mutations to business tables
- Unwrapped Server Actions (missing audit middleware)
- Forms without `react-hook-form` + zod
- UI components outside shadcn that introduce a new design system
- CSS-in-JS that creates a new runtime
- Direct DOM manipulation outside escape-hatch refs
- Force-pushing to `main`
- Skipping tests for "speed" (per the playbook anti-patterns)

---

## 14. Encouraged patterns

- Asking before assuming
- Suggesting an ADR when a decision has long-term consequences
- Pointing out when a request conflicts with prior decisions
- Suggesting a simpler approach when one exists
- Writing the test before the implementation when logic is non-trivial
- Inline comments for non-obvious business rules (`// IRS Pub 15-T 2026 §4 — additional Medicare kicks in at $200k for single`)
- Pruning code aggressively (delete dead code; comments are not graveyards)
- Using shadcn's full vocabulary (Sheet, Dialog, Drawer, Command, Tooltip) before inventing new patterns
- Default values in schemas, defaults in forms, defaults in queries

---

## 15. Definition of done

A PR is done when **all** of these are true:

- [ ] `pnpm tsc --noEmit` passes (zero TypeScript errors)
- [ ] `pnpm lint` passes (zero new warnings)
- [ ] `pnpm test` passes (existing tests + any new ones for the change)
- [ ] Manual smoke test described in the PR or recorded
- [ ] Conventional commit message proposed
- [ ] Docs updated if data model, conventions, or architecture changed
- [ ] No new dependencies (or ADR added if there are)
- [ ] No new env vars (or `.env.example` + `lib/env.ts` updated)
- [ ] Mobile responsive (tested at 375px width if UI changed)
- [ ] Five-minute test passed for new user flows
- [ ] If AI was added: `ai_runs` logging confirmed, budget configured

---

## 16. What's missing? What's wrong? What do we do next?

Two flags:

1. **Section 6.10 (Visual polish) is opinionated.** I prescribed accent color, spacing, shadow, and animation defaults. If you want a specific brand palette (Varahi Group colors, CXAllies colors), provide it now and I fold it in. Otherwise the default is shadcn's slate-with-blue and we tune in implementation.

2. **Section 7.4 (Money naming) and Section 3.4 (DB money) reinforce the same rule.** If a future developer can't keep this straight, that's a hire problem, not a doc problem. I'd rather over-document than under-document for the foundation.

Reply or "go" and I produce the final planning artifact: `docs/phase-1-tickets.md` — the 15-25 atomic tickets that turn this plan into Claude Code work.
