# ADR-0002: Drizzle ORM over Prisma

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-04-26 |
| **Deciders** | Venkata Sundaragiri (Owner / Lead Engineer) |
| **Consulted** | AI architecture partner (this conversation) |
| **Supersedes** | — |
| **Superseded by** | — |

---

## 1. Context

CXAllies — Intelligent AI/ERP Solutions runs on Postgres 16 with TypeScript end-to-end. The system has roughly 60 tables across 11 modules with heavy cross-table JOINs (Customer 360 view, Project Health tile, executive dashboards). Schema iteration speed during Phase 1 is critical — we expect 30+ migrations in the first six weeks as the model settles.

Two TypeScript ORMs are realistic candidates in 2026:

1. **Prisma** — schema-first DSL (`schema.prisma`), separate code generation step, query builder API, mature ecosystem
2. **Drizzle** — TypeScript-first schema (`schema.ts`), no codegen step, SQL-like query builder + relational queries API, lighter runtime

A third path — raw SQL via `postgres.js` or `node-postgres` with manual type definitions — is rejected up front; the maintenance burden of hand-rolled types across 60 tables is project-killing for a one-person team.

This decision affects every database interaction in the codebase. Reversing it is mechanical but tedious (touches every `actions/` and `api/` file). Worth deciding deliberately.

---

## 2. Decision

**We adopt Drizzle ORM.** Schema definitions in TypeScript, migrations generated via `drizzle-kit`, queries written with Drizzle's relational queries API for fetch-with-relations and the SQL-like builder for everything else. No Prisma.

---

## 3. Rationale

### 3.1 Schema authoring matches the rest of the stack

Our entire stack is TypeScript. Prisma introduces a separate schema language (`schema.prisma`) with its own syntax, type system, and tooling. Every schema change requires:

1. Edit `schema.prisma`
2. Run `prisma generate`
3. Wait for the codegen
4. Restart the TypeScript server to pick up the new types

Drizzle eliminates steps 2–4. Schema is TypeScript:

```typescript
// src/modules/finance/schema.ts
export const expenseEntries = pgTable('finance_expense_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  currencyCode: char('currency_code', { length: 3 }).notNull().default('USD'),
  // ...
});
```

Types are inferred immediately. No codegen, no stale types, no second schema language to learn. For a one-person team iterating on schema weekly during Phase 1, this is material time saved.

### 3.2 SQL transparency

Prisma's query API hides SQL behind a fluent builder. The benefit is consistency; the cost is that you cannot reliably predict what query Prisma will issue. The N+1 problem is well-documented in Prisma — `findMany({ include: { ... } })` issues separate queries per relation rather than a JOIN, and developers discover this only via slow-query logs in production.

Drizzle's relational queries API issues one JOIN. The SQL builder API lets you write the exact query you want when needed:

```typescript
// Drizzle relational query — issues a single JOIN
const projectsWithContracts = await db.query.billingProjects.findMany({
  with: {
    contract: true,
    timeEntries: { where: gte(timeEntries.date, weekStart) },
  },
});

// Drizzle SQL builder — predictable, debuggable
const result = await db
  .select({ /* exact columns */ })
  .from(billingProjects)
  .leftJoin(crmContracts, eq(billingProjects.contractId, crmContracts.id))
  .where(/* ... */);
```

For an accounting system where the Project Health view JOINs across 6 tables, knowing exactly what SQL runs is not a luxury. It's the difference between sub-100ms queries and 500ms queries discovered three months in.

### 3.3 Migration ergonomics

Both tools generate migrations from schema diffs. The difference is in the workflow.

| | Prisma | Drizzle |
|---|---|---|
| Schema source | `schema.prisma` (custom DSL) | `schema.ts` files per module (TypeScript) |
| Generate migration | `prisma migrate dev --name X` | `drizzle-kit generate --name X` |
| Apply migration | `prisma migrate deploy` | `drizzle-kit migrate` or programmatic |
| Custom migration logic | Possible but awkward (raw SQL files alongside generated ones) | Native — migrations are SQL files you edit freely |
| Migration history | Tracked in `_prisma_migrations` | Tracked in `__drizzle_migrations` |
| Rollback | Not supported. Prisma philosophy is forward-only. | Same — forward-only. |

Both are fine for our workflow. Drizzle's edge here is that custom migrations (e.g., backfilling a denormalized column) are first-class — just edit the generated SQL — whereas Prisma's recommended pattern requires a separate workflow.

### 3.4 Performance and runtime weight

Prisma ships a Rust query engine binary (~25MB) loaded into the Node process. This adds ~40–80ms cold-start time on serverless (Vercel) and ~30MB of RSS per running process. For Vercel functions, this matters — every invocation pays the cold-start tax until the function warms.

Drizzle is pure TypeScript. No native binary, no separate process, no cold-start tax beyond importing a JS module. Cold start is ~5ms.

The Vercel deployment for CXAllies will run the entire Next.js app as serverless functions. Prisma's cold-start cost compounds across our ~50 tRPC procedures.

This is documented at length in Prisma's own performance guidance and in numerous blog posts about Vercel + Prisma cold-start mitigation strategies (connection pooling proxies, edge runtime workarounds, etc.). Drizzle sidesteps the entire category.

### 3.5 Postgres-specific features

CXAllies uses Postgres-specific features extensively:

| Feature | Used for | Prisma support | Drizzle support |
|---|---|---|---|
| `JSONB` columns | `custom_fields`, `metadata`, AI suggestion payloads | Good (`Json` type) | Excellent (typed via Zod or generic) |
| `pgvector` | AI embeddings for similarity search | Possible via raw queries | Native via `drizzle-orm/pg-core` extension |
| Partial indexes | Soft-delete filters, status filters | Limited (must drop to raw SQL) | First-class in `index().where(...)` |
| Generated columns | Computed fields | Limited | Supported |
| `CHECK` constraints | Money sign, date range, file XOR rules | Limited | First-class |
| Custom enums | Status fields | Good | Good |
| Materialized views | Project Health, dashboard rollups | Not supported (raw SQL) | Not directly supported (raw SQL); cleaner integration |

For features Prisma doesn't support natively, the escape hatch is `prisma.$queryRaw` — which loses type safety and reintroduces the manual-types problem we wanted to avoid. Drizzle's coverage of Postgres-native features is materially better.

### 3.6 Bundle size and dependency surface

| | Prisma | Drizzle |
|---|---|---|
| Runtime dependencies | `@prisma/client` (~5MB) + Rust engine binary (~25MB) | `drizzle-orm` (~500KB) |
| Build-time dependencies | `prisma` CLI (~70MB), `@prisma/engines` | `drizzle-kit` (~5MB) |
| Total install size | ~100MB | ~10MB |

For a Vercel project where bundle size affects cold-start and deploy time, the order-of-magnitude difference matters.

### 3.7 Team familiarity and ecosystem maturity

Honest counterargument: Prisma has materially more StackOverflow answers, blog posts, and Stack Overflow questions resolved. A new collaborator hired in 2026 is more likely to have used Prisma than Drizzle.

Mitigation: Drizzle's documentation is good (drizzle-orm.com is comprehensive), the API surface is small enough to learn in a day, and the SQL-like syntax is more transferable than Prisma's bespoke query DSL. A SQL-fluent engineer (which any senior backend hire will be) reads Drizzle queries fluently from day one.

### 3.8 The CLAUDE.md and locked-stack constraint

Per the CLAUDE.md draft and the kickoff prompt: "Drizzle (no Prisma)" is already locked. This ADR documents *why* the lock is sound, not whether to lock it. If the rationale here doesn't hold up, we revisit; otherwise this is the receipt for a decision already made.

---

## 4. Consequences

### 4.1 Positive

- TypeScript-native schema. No codegen step. Type changes propagate immediately.
- Predictable SQL. Every query the ORM issues is inspectable; N+1 is prevented by API design (`findMany` issues one query, not N).
- ~10x smaller install footprint vs Prisma. Faster CI, faster Vercel deploys, faster cold starts.
- First-class support for Postgres-native features (JSONB, partial indexes, CHECK constraints, pgvector).
- Migration files are plain SQL we can edit freely for backfills or data fixes.
- Lower lock-in. Schema is just TypeScript; if Drizzle dies, exporting tables to raw SQL + manual types is a one-day job.

### 4.2 Negative

- Smaller ecosystem. Fewer Stack Overflow answers, fewer integrations (e.g., NextAuth's first-party adapter is Prisma-first; Drizzle adapter is community-maintained but solid).
- Less "batteries included" — Drizzle Studio (the DB browser GUI) exists but is less polished than Prisma Studio.
- Some patterns require more code in Drizzle (e.g., soft-delete is opt-in per-query in Drizzle; Prisma has middleware that auto-applies). Mitigation: a thin wrapper around `db` that auto-filters `deleted_at IS NULL`.
- New collaborators familiar with Prisma have a one-day onboarding cost to Drizzle.

### 4.3 Neutral

- Both ORMs require us to write our own migration patterns for non-trivial cases (data backfills, column renames). This is unavoidable in any ORM and is not a Drizzle-specific cost.
- Both ORMs treat the database as forward-only. Rollbacks are by writing a forward migration that reverses the change.

---

## 5. Implementation rules

### 5.1 Schema authoring

- Each module owns a `schema.ts` file in `src/modules/{name}/schema.ts`.
- All tables export from there. No exports from `db/` directly — `db/index.ts` re-exports the union of module schemas.
- Cross-module foreign keys reference the other module's exported table object (Drizzle handles the type inference).

### 5.2 Query patterns

- **Read queries** use the relational queries API (`db.query.X.findMany({ with: { ... } })`) when fetching with relations. This compiles to one JOIN.
- **Write queries** use the SQL builder (`db.insert().values()`, `db.update().set().where()`).
- **Complex reports** that need window functions, CTEs, or specific query plans use raw SQL via `db.execute(sql\`...\`)` — typed via Zod.

### 5.3 Soft-delete discipline

Drizzle does not auto-filter soft-deleted rows. We add a thin wrapper:

```typescript
// src/lib/db/active.ts
export const active = <T extends { deletedAt: timestamp }>(table: T) =>
  isNull(table.deletedAt);

// Usage:
db.query.expenseEntries.findMany({ where: active(expenseEntries) });
```

Code review enforces use of `active()` or explicit comment when soft-deletes are intentionally included.

### 5.4 Migration workflow

1. Edit `src/modules/{name}/schema.ts`
2. Run `pnpm db:generate --name describe_change` — produces a SQL migration file
3. Review the generated SQL
4. Edit the file if backfills or data fixes are needed
5. Run `pnpm db:migrate` locally
6. Commit both the schema change and the migration file in the same commit
7. CI applies migrations on deploy

### 5.5 Connection pooling

- Local: Drizzle's default `node-postgres` pool, 10 connections
- Vercel functions: `postgres.js` driver in transaction mode with Railway's connection pooler (or a separate PgBouncer instance) — Vercel functions are short-lived and need to release connections eagerly
- Worker process: dedicated pool, 20 connections, long-lived

This is implementation detail captured here so the conventions doc can reference it.

### 5.6 Type generation

Drizzle types come from the schema directly:

```typescript
import { expenseEntries } from '@/modules/finance/schema';

type ExpenseEntry = typeof expenseEntries.$inferSelect;     // for reads
type NewExpenseEntry = typeof expenseEntries.$inferInsert;  // for writes
```

These types live in `src/modules/finance/types.ts` (re-exported from the public surface). No separate codegen artifact.

---

## 6. Alternatives considered

### 6.1 Prisma (rejected)

The primary alternative. Rejected for the reasons in §3 — primarily the codegen friction during heavy schema iteration, the cold-start tax on Vercel, and weaker Postgres-native feature support.

### 6.2 Kysely (considered, rejected)

A pure SQL query builder with strong TypeScript inference. Excellent at what it does. Rejected because:

- No relational queries API — every JOIN is hand-written
- No schema-as-source-of-truth — schema lives separately and types are imported
- No migration tooling out of the box

For a system with 60 tables and heavy cross-module JOINs, Drizzle's relational queries API saves significant boilerplate that Kysely would require us to write by hand.

### 6.3 TypeORM (rejected)

The legacy ActiveRecord-style ORM in TypeScript. Rejected because:

- Decorator-based schema definition has known type-inference issues
- Mature but stagnating; community momentum has shifted to Prisma and Drizzle
- Heavier API surface for a system that doesn't need ActiveRecord patterns

### 6.4 MikroORM (rejected)

Data Mapper pattern with Unit of Work. Powerful but complex. Rejected because:

- Learning curve is steep — Unit of Work changes how you think about persistence
- Overkill for a system where most mutations are simple INSERT/UPDATE patterns
- Smaller ecosystem than Drizzle in 2026

### 6.5 Raw SQL with manual types (rejected)

Pure `postgres.js` or `node-postgres` with hand-written TypeScript types. Rejected because:

- 60+ tables of manual type definitions become a maintenance burden
- No migration tooling
- The discipline required to keep types in sync with the database is exactly what an ORM is for

### 6.6 Postgres + PostgREST (out of scope but noted)

Auto-generated REST API directly from Postgres schema. Not a TypeScript ORM but a full architecture pattern. Rejected because:

- Tight coupling between API shape and DB schema is the wrong default for a system with business logic
- Loses the type-safety of tRPC end-to-end
- Doesn't fit our locked stack

---

## 7. References

- Drizzle ORM docs — https://orm.drizzle.team
- Drizzle vs Prisma feature comparison — https://orm.drizzle.team/docs/why-drizzle
- Prisma cold-start guidance on Vercel — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/serverless-environments
- pgvector + Drizzle integration — `drizzle-orm` repo, `pg-core/columns/vector.ts`
- CLAUDE.md draft, "Tech stack — LOCKED" section
- Architecture document `01-architecture.md` §3

---

## 8. What's missing? What's wrong? What do we do next?

Two things to verify before this locks:

1. **Connection pooling strategy in §5.5.** I specified `postgres.js` in transaction mode behind Railway's pooler for Vercel functions. If Railway's pooler is unreliable in your testing, the alternative is Supabase's built-in pooler or a dedicated PgBouncer instance. We don't need to decide today — note it for when we hit the deploy ticket in Phase 1.

2. **Drizzle Studio vs alternative DB browsers.** I mentioned Drizzle Studio is less polished than Prisma Studio. If you want a richer DB browsing experience for ad-hoc queries during development, alternatives include TablePlus (\$89 one-time), DBeaver (free), or Postico 2 (\$50). Not an architectural decision — flag for tooling setup.

Reply with corrections or "go" and I produce ADR-0003 (AI as a first-class module) next.
