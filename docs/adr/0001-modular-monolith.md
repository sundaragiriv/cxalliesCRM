# ADR-0001: Modular Monolith Over Microservices

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

CXAllies — Intelligent AI/ERP Solutions is being built by a one-person engineering team (with a second collaborator joining within 12 months) to replace QuickBooks, HubSpot, Zendesk, Mailchimp, and several smaller SaaS tools. The product is initially single-tenant for Varahi Group LLC's internal use, with a possible SaaS pivot in 18+ months.

The system covers 11 functional modules: `auth`, `parties`, `finance`, `billing`, `crm`, `support`, `marketing`, `payroll`, `hr`, `reporting`, and `ai`. Modules share data heavily — the activity timeline, the consulting Project Health view, and most reporting dashboards JOIN across 4+ modules in a single query. AI is a first-class module that subscribes to events from every other module.

Two architectural styles are credible candidates:

1. **Modular monolith** — one Next.js app, one Postgres database, modules separated by code boundaries (folder structure, public API contracts, lint rules)
2. **Microservices** — each module (or cluster of modules) deployed as an independent service with its own database, communicating via HTTP/gRPC and a message broker

This decision is foundational. Reversing it costs months of work either direction, so it deserves an explicit rationale before code is written.

---

## 2. Decision

**We adopt a modular monolith.** One Next.js application, one Postgres 16 database, all modules under `src/modules/{name}/` with strict public API contracts. Microservices are explicitly considered and deferred. Trigger conditions for revisiting this decision are listed in §6.

---

## 3. Rationale

### 3.1 Match between architecture and team size

Microservices solve organizational problems (independent team velocity, autonomous deploys, polyglot tech stacks) more than technical problems. The team here is one developer with a likely second collaborator. There is no team-coordination problem to solve.

The well-cited "you must be this tall" rule of thumb — typically attributed to Martin Fowler and Sam Newman — places the operational floor for microservices at roughly 6–10 engineers. Below that line, the operational tax (distributed tracing, service mesh, deploy orchestration, schema coordination) consumes more time than the modularity buys back.

### 3.2 The activity timeline and reporting layer

Three of the system's five differentiators per the vision document — activity-centric source of truth, AI-native, cross-business insights — depend on JOINing across modules in a single transaction. Examples:

- The Customer 360 view JOINs `parties`, `activities`, `crm_deals`, `support_tickets`, `billing_invoices`, `billing_payments`
- The Project Health tile JOINs `billing_projects`, `crm_contracts`, `parties`, `billing_time_entries`, `finance_expense_entries`, `billing_invoices`, `billing_payments`
- The executive dashboard tiles JOIN revenue/expense/AR/AP data across all monetary modules

In a monolith these are single Postgres queries with sub-100ms p95. In microservices they become orchestration layers that fan out 6+ HTTP calls and reassemble the result. The latency budget collapses, the failure modes multiply (any one service down breaks the view), and the code that does the assembly becomes a de-facto god service.

### 3.3 Transactional integrity

Several core flows in the system require atomic multi-table mutations:

- "Create invoice from approved timesheet" writes to `billing_invoices`, `billing_invoice_lines`, `billing_time_entries` (mark invoiced), `journal_entries`, `journal_lines`, `activities`, and `audit_log` in one transaction
- "Mark expense report approved and reimburse" writes to `finance_expense_reports`, `finance_expense_entries`, `journal_entries`, `journal_lines`, `activities`, and `audit_log`
- "Subscription renewal" writes to `billing_subscriptions`, `billing_subscription_events`, `billing_invoices`, `journal_entries`, and `activities`

In a monolith these are `BEGIN; ... COMMIT;` with full ACID guarantees. In microservices they require the saga pattern with compensating transactions, an outbox table per service, and idempotency keys throughout. The implementation cost is roughly 5x and the failure modes are 10x.

For an accounting system this is not a marginal trade-off. Partial-success states in financial data are a serious correctness problem.

### 3.4 Schema evolution speed

In a monolith, a schema change is one Drizzle migration that runs once. In microservices, a schema change that affects two services requires:

1. Backward-compatible migration on the producer
2. Update the consumer to read both old and new shapes
3. Migrate the producer to the new shape
4. Wait for the message backlog to drain
5. Remove the old-shape code from the consumer

For a one-person team iterating on schema weekly during Phase 1, this overhead is project-killing.

### 3.5 Local development experience

Monolith local dev is `pnpm dev` plus a Postgres container. Total cognitive load: one process, one DB connection, one debugger.

Microservices local dev is N services, a message broker, a service registry, and either Docker Compose (slow, fragile) or running every service in a separate terminal. New-collaborator onboarding goes from one hour to one day.

### 3.6 Operational cost

| Concern | Monolith | Microservices |
|---|---|---|
| Deploys | One Vercel deploy per push | N service deploys, coordinated |
| Logs | One stream | N streams, correlated by trace ID |
| Monitoring | One service health check | N health checks + service mesh |
| On-call | One pager | One pager but N possible failure points |
| Secrets | One env file | N env files, often duplicated |
| Cost | ~\$30/mo Phase 1 | ~\$200–500/mo Phase 1 (services + broker + tracing) |

For a side-project-budget product whose first user is the developer, the monolith wins by an order of magnitude on cost alone.

---

## 4. Consequences

### 4.1 Positive

- One deploy, one DB, one set of logs. New-collaborator onboarding is hours not days.
- ACID transactions across module boundaries. Financial integrity is trivially correct.
- Single-query JOINs power the activity timeline, Project Health view, and dashboards at sub-100ms p95.
- Schema evolution is one migration per change. Iteration speed is preserved through Phase 1.
- Vercel + Railway hosting fits in the \$25–\$40/mo budget through Phase 1.

### 4.2 Negative

- A poorly-disciplined team can erode module boundaries by importing across them. Mitigated by:
  - ESLint rule (`no-restricted-imports`) blocking cross-module non-public imports
  - Code review checklist requiring every PR to confirm boundary compliance
  - The `convention.md` doc making the rule explicit
- A single bad query or memory leak takes down the whole app. Mitigated by:
  - Database connection limits at the pool layer
  - Sentry error budgets with alerts
  - Performance tests on hot paths
- Scaling requires vertical-then-horizontal. Postgres becomes the throughput ceiling. Mitigated by:
  - Read replicas (Railway supports them) when read load grows
  - Reporting rollup tables to keep dashboard queries off the OLTP path
  - Phase 5+ revisit if any of the trigger conditions in §6 hit

### 4.3 Neutral

- Code architecture and deploy architecture are decoupled. The system is structured *as if* it were N services (public APIs, events, no cross-module internals) but deployed as one. This is the deliberate design — see §5.

---

## 5. Implementation discipline

The monolith only delivers its benefits if discipline is enforced. The following rules are non-negotiable and ship in `docs/03-conventions.md`:

### 5.1 Module structure

Every module lives in `src/modules/{name}/` with this exact shape:

```
src/modules/{name}/
├── api/         # Public read interface (tRPC procedure implementations)
├── actions/     # Public write interface (Server Action implementations)
├── events/      # Event emitters and subscribers
├── types.ts     # Public exported types
├── components/  # Internal — module's own UI
├── lib/         # Internal — module's own utilities
└── schema.ts    # Internal — Drizzle tables for this module
```

### 5.2 Cross-module rules

- A module **may not** import from another module's `components/`, `lib/`, or `schema.ts`. These are internal.
- A module **may** import from another module's `api/`, `actions/`, `events/`, and `types.ts`. These are public.
- Cross-module data access goes through the public `api/` layer.
- Cross-module side effects go through events.
- Shared types (used by 3+ modules) move to `packages/shared/`.

### 5.3 Lint enforcement

ESLint rule:

```js
// .eslintrc.js
{
  "no-restricted-imports": ["error", {
    "patterns": [
      {
        "group": ["**/modules/*/components/**", "**/modules/*/lib/**", "**/modules/*/schema*"],
        "message": "Cross-module internal imports are forbidden. Use the module's api/ or actions/."
      }
    ]
  }]
}
```

This rule fires in CI. Violations block merges.

### 5.4 Database boundaries

Even though all tables live in one Postgres database, foreign keys that cross module boundaries must be reviewed at PR time. The PR template includes a checkbox: "Does this PR add a cross-module FK? If yes, link the issue justifying it." Cross-module FKs are allowed (the consulting engagement lifecycle requires `billing_projects.contract_id → crm_contracts.id`) but they're tracked deliberately.

---

## 6. Trigger conditions for revisiting

This decision is **not permanent**. We revisit microservices when any one of the following becomes true:

| Trigger | Why it changes the calculation |
|---|---|
| **Team size ≥ 6 engineers** | Coordination cost on a shared codebase exceeds the operational tax of microservices. |
| **One module has 100x scaling needs vs the rest** | E.g., support module receives 10K tickets/hour while finance handles 100/day. Vertical scaling becomes wasteful. |
| **Hard isolation required for compliance** | PCI-DSS, HIPAA, SOC 2 with per-tenant boundaries, or regulated data residency. |
| **Multi-tenant SaaS with per-tenant deployment** | Some enterprise customers refuse shared-tenancy. Per-tenant containers may force at least partial extraction. |
| **A module needs a non-Node runtime** | E.g., a high-performance numeric module in Rust or Go. Process isolation becomes natural. |

If any of these triggers, the next ADR will propose extraction of one module (most likely a candidate: `support` or `marketing`) and document the migration plan. The current architecture's discipline — public APIs, events, no cross-module internals — makes that extraction mechanical, not architectural.

### 6.1 What is explicitly *not* a trigger

- **Vague performance worries.** Postgres with proper indexing handles millions of rows comfortably. Performance is solved with profiling, not extraction.
- **Resume-driven development.** Microservices are not, in 2026, a hiring or career signal worth optimizing for.
- **"It feels too coupled."** Coupling is a code-review issue. Solve it with discipline before solving it with infrastructure.
- **Marketing pressure to claim "microservices architecture."** No customer cares; they care about uptime and features.

---

## 7. Alternatives considered

### 7.1 Microservices (rejected)

Discussed above. Operational cost not justified by current or 12-month-projected team size or scale needs.

### 7.2 Modular monolith with Postgres schemas per module (rejected)

Considered using Postgres `CREATE SCHEMA` to give each module its own namespace within the same database. Rejected because:

- Cross-schema JOINs are syntactically awkward (`finance.expenses JOIN crm.deals`) and Drizzle's relational query support degrades
- Migration tooling complexity grows (per-schema migration tracking)
- The benefit is purely cosmetic — table prefixes (`finance_expenses`, `crm_deals`) achieve the same logical separation with simpler tooling

Decision: use table-name prefixes, not schemas.

### 7.3 Frontend/backend split (rejected)

Considered separating the React frontend from a Node/Express backend in two repos. Rejected because:

- Next.js Server Components + tRPC give us end-to-end type safety in one codebase. Splitting destroys that.
- Two repos = two CI pipelines, two deploys, two version-skew problems
- Single repo with `apps/web` + `packages/shared` covers the only legitimate need (shared types) without the overhead

Decision: single Next.js app, monorepo with one app and shared packages.

### 7.4 Serverless functions per module (rejected)

Considered deploying each module's API as a separate set of Vercel serverless functions with its own pgBouncer pool. Rejected because:

- Vercel already deploys tRPC routers as serverless functions; we get this benefit without architectural commitment
- Per-module function deploys would require coordinating function-level type contracts across deploys, which destroys the type-safety benefit
- Cold starts become per-module, not per-app — net worse latency

Decision: standard Next.js deployment on Vercel; let the platform handle function granularity.

---

## 8. References

- Martin Fowler, "Monolith First" (2015) — https://martinfowler.com/bliki/MonolithFirst.html
- Sam Newman, *Building Microservices* (2nd ed., 2021), chapters on team size and operational complexity
- Vision document `00-vision.md` §4.1 (Architecture) — explicitly mandates modular monolith
- Architecture document `01-architecture.md` §1.3, §2, §12

---

## 9. What's missing? What's wrong? What do we do next?

This ADR is intentionally one of the longer ones because it is foundational. Two things to verify:

1. **Trigger conditions in §6.** I listed five conditions for revisiting. If you can think of a sixth that's specific to your business (e.g., "if Pravara.ai grows past 100K users, extract its subscription engine"), add it now.

2. **Lint enforcement in §5.3.** I specified the ESLint pattern. If you'd rather use a custom checker (e.g., `dependency-cruiser`) for stricter dependency rules, say so — `dependency-cruiser` produces a graph and can fail builds on cycles or boundary violations more comprehensively than `no-restricted-imports`. I lean ESLint for simplicity; `dependency-cruiser` for rigor.

Reply with corrections or "go" and I produce ADR-0002 (Drizzle over Prisma) next.
