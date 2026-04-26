# CXAllies — Architecture (v2)

> System architecture, module boundaries, event topology, and deployment plan for **CXAllies — Intelligent AI/ERP Solutions**, a product of Varahi Group LLC.
> Supersedes v1. Changes in v2 are listed in §14 (Changelog) so future readers understand what moved and why.
> All vocabulary in this document follows [`04-glossary.md`](./04-glossary.md).
> Major architectural decisions are formalized as ADRs in [`docs/adr/`](./adr/).

---

## 1. System overview

### 1.1 What this is

A single Next.js 15 application backed by a single Postgres 16 database. One deploy, one database, one codebase. Modular monolith — every module lives in `src/modules/{name}/` with strict boundaries enforced by lint rules and code review. Single-tenant: one Varahi Group, one operator pool today (Venkata + Poornima). Designed so a future multi-tenant SaaS pivot is a schema migration, not a rewrite.

### 1.2 What it replaces

QuickBooks (finance + invoicing), HubSpot (CRM), Zendesk (support), Mailchimp (marketing email), Stripe Dashboard (subscriptions, Phase 3+), and the ad-hoc Google Drive folders + Excel workbooks that accumulate when a multi-line operator outgrows them.

### 1.3 What it is not

- Not a microservices system. ADR-0001 covers why.
- Not a multi-tenant SaaS today. The schema doesn't include a `tenant_id` column. Adding one later is an additive migration.
- Not a workflow engine. Phase 5 adds one. Today, automations are hardcoded subscriptions to module events.
- Not a general-purpose ledger. It is a single-entry-recording system that emits double-entry journal entries. Designed-for-double-entry, run-as-single-entry in Phase 1.

---

## 2. Logical architecture

### 2.1 Layered view

```
┌───────────────────────────────────────────────────────────────┐
│                         Browser / PWA                         │
│  React 19 Server + Client Components, Tailwind, shadcn/ui     │
└───────────────────────┬───────────────────────────────────────┘
                        │  HTTPS
┌───────────────────────▼───────────────────────────────────────┐
│                    Next.js 15 App Router                      │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Route layer: /app/(authed)/*, /app/api/*               │  │
│  └────────────┬─────────────────────────────┬──────────────┘  │
│  ┌────────────▼────────┐         ┌──────────▼──────────────┐  │
│  │  tRPC routers       │         │  Server Actions          │  │
│  │  (queries, public)  │         │  (mutations, public)     │  │
│  └────────────┬────────┘         └──────────┬──────────────┘  │
│               │                              │                 │
│  ┌────────────▼──────────────────────────────▼──────────────┐  │
│  │              Module public surface                        │  │
│  │   src/modules/{auth,parties,finance,billing,crm,         │  │
│  │                support,marketing,payroll,hr,              │  │
│  │                reporting,ai}/                             │  │
│  │   Each module exposes ONLY: api/, actions/, events/,     │  │
│  │   types.ts                                                │  │
│  └────────────┬──────────────────────────────┬──────────────┘  │
│  ┌────────────▼─────────┐         ┌──────────▼──────────────┐  │
│  │  Event bus           │         │  Cross-module           │  │
│  │  (in-process pub/sub │         │  service contracts      │  │
│  │   + pg-boss outbox)  │         │  (typed, public api/)   │  │
│  └────────────┬─────────┘         └──────────┬──────────────┘  │
└───────────────┼─────────────────────────────┼──────────────────┘
                │                             │
┌───────────────▼─────────────────────────────▼──────────────────┐
│  Postgres 16 (single DB, table-prefix logical separation)      │
│  + pg-boss (job queue in same DB)                              │
│  + activities + audit_log + parties (cross-module shared)      │
└────────────────────────────────────────────────────────────────┘
       │                       │                          │
┌──────▼─────────┐   ┌─────────▼──────────┐   ┌──────────▼────────┐
│  Cloudflare R2 │   │  Google Drive      │   │  Postmark         │
│  (system-      │   │  (user-curated     │   │  (transactional + │
│   generated    │   │   docs, linked     │   │   inbound webhook)│
│   files)       │   │   references)      │   │                   │
└────────────────┘   └────────────────────┘   └───────────────────┘
                                                        │
                                              ┌─────────▼─────────┐
                                              │  AI providers     │
                                              │  (Anthropic /     │
                                              │   OpenAI),        │
                                              │   invoked via     │
                                              │   ai/ module only │
                                              └───────────────────┘
```

### 2.2 Component responsibilities

| Component | Responsibility | Boundary rule |
|---|---|---|
| **Route layer** | Auth check, layout, hand off to tRPC or Server Actions. | No business logic. |
| **tRPC routers** | All read queries. One router per module, mounted at `/api/trpc`. | Calls only the owning module's `api/`. |
| **Server Actions** | All write mutations. Colocated with the route that triggers them. | Calls only the owning module's `actions/`. |
| **Module `api/`** | The module's public read interface. Pure functions of (input, db) → output. | May call its own `lib/` and `schema.ts`. May NOT import from another module's internals. |
| **Module `actions/`** | The module's public write interface. Validates input, mutates DB, emits events, writes audit log. | Same isolation as `api/`. |
| **Module `events/`** | Event emitters and subscribers. Cross-module wiring lives here. | Subscribers may call other modules' `api/` and `actions/`. |
| **Module `lib/`** | Internal helpers. Never imported from outside the module. | Strict. ESLint rule enforces. |
| **Module `schema.ts`** | Drizzle table definitions for this module. Never imported from outside the module — exports go through `types.ts`. | Strict. |
| **`db/`** | Drizzle client singleton, migration runner, connection pool. | Imported by every module. |
| **`lib/`** (top-level) | Truly cross-cutting: currency formatting, date helpers, zod helpers. | No business logic, no module knowledge. |
| **`packages/shared/`** | Types shared across modules. | Pure types only. No runtime code that could create a cyclic dependency. |

### 2.3 The 11 modules (10 business + 1 cross-cutting)

| Module | Phase | Owns | Depends on (via public API) |
|---|---|---|---|
| `auth` | 1 | Users, sessions, RBAC roles. Wraps Better Auth. | — |
| `parties` | 1 | Parties (universal contact), party_roles, party_relationships, addresses. | `auth` |
| `finance` | 1 | Chart of Accounts, journal entries, journal lines, revenue entries, expense entries, expense reports, corporate cards, tax estimates, tax rates. | `parties`, `auth` |
| `billing` | 1 | Projects, time entries, timesheets, invoices, invoice lines, payments, **subscription_plans, subscriptions, subscription_events, memberships**. | `parties`, `finance`, `crm` (for Contract→Project link), `auth` |
| `crm` | 2 (rich), 1 (lite skeleton) | Opportunities, contracts, rate_cards, deal_stages (per business line), tags, custom_field_definitions. | `parties`, `auth` |
| `support` | 2 | Tickets, ticket_messages, canned_responses, kb_articles, sla_policies. | `parties`, `auth` |
| `marketing` | 3 | Campaigns, sequences, segments, lead_forms, lead_form_submissions, promotions. | `parties`, `crm`, `auth` |
| `payroll` | 4 | Pay periods, pay runs, pay stubs, owner draws. | `parties`, `finance`, `hr`, `auth` |
| `hr` | 4 (rich), 1 (skeleton) | Employees, pto_balances, pto_requests, employee_documents. | `parties`, `auth` |
| `reporting` | 1 (tiles), 4 (custom builder) | Dashboards, dashboard tiles, KPI registry, saved queries. | All other modules' `api/` |
| `ai` | 1 (substrate), 5 (features) | AI runs, AI suggestions, embedding vectors. | All other modules (subscriber, never owner) |

**Three modules ship a skeleton in Phase 1 even though their full functionality is later:**
- `crm` ships the Contract + Project linkage in Phase 1 because the consulting business depends on it. The deal pipeline UI ships in Phase 2.
- `hr` ships `hr_employees` table in Phase 1 because Payroll references it. PTO and documents wait until Phase 4.
- `reporting` ships the dashboard + tile primitives in Phase 1. The custom report builder ships in Phase 4.

`activities` and `audit_log` are **cross-module shared tables** owned by no single module. ADR-0001 elaborates on why two tables get to break the module-isolation rule.

**Shipping is removed from the module list.** It's now a "deferred future capability" tracked in §11. If physical fulfillment volume materializes, it gets reinstated as Phase 4+ work with its own ADR.

### 2.4 Module dependency graph

```
                              auth
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
            parties      [used by all]
                │
        ┌───────┼─────────────┬──────────────┐
        ▼       ▼             ▼              ▼
     finance  crm          support       hr
        │      │              │           │
        │      │              │           │
        ▼      ▼              │           ▼
       billing  ──┐           │        payroll
        │  ▲     │            │           │
        │  │     │            │           │
        │  └─ contract ◄──────┘           │
        │     governs                     │
        │     project                     │
        │                                 │
        ▼                                 │
    marketing ◄── crm                     │
        │                                 │
        ▼                                 │
    reporting ◄── all of the above ◄──────┘
        │
        ▼
    ai ──── subscribes to events from every module
```

Rules visualized: dependencies flow downward; no module imports a peer's internals; CRM's contracts govern Billing's projects via the public API contract; AI is a pure subscriber that calls back into modules through their public API only.

---

## 3. Data architecture

### 3.1 Single Postgres database

One database, one connection pool, one Drizzle client. No microservice boundaries → no distributed-transaction problems. ADR-0001 makes the case.

### 3.2 Logical schema separation

We do not use Postgres schemas (the namespace feature) to separate modules. Reason: it complicates JOINs across modules, which the activity timeline, project health view, and reporting layer require constantly. Instead:

- **Naming convention:** every table is prefixed with its module's domain (e.g., `crm_opportunities`, `billing_invoices`, `support_tickets`). Cross-module shared tables are unprefixed (`activities`, `audit_log`, `parties`).
- **Foreign keys** are explicit and may cross module boundaries (e.g., `crm_contracts.end_client_party_id REFERENCES parties.id`, `billing_projects.contract_id REFERENCES crm_contracts.id`).
- **Migrations** are global (one Drizzle migration directory) but each migration file references the modules it touches in its filename: `2026_01_15_finance_add_corporate_cards.sql`.

### 3.3 Cross-module shared tables

Three tables are owned by no module:

| Table | Why it's shared |
|---|---|
| `parties` | Every module references it. Owned by the `parties` module conceptually but read by all. |
| `activities` | Every module emits to it. The unified timeline depends on a single source. |
| `audit_log` | Every mutation writes to it. Shared infrastructure. |

These three tables are the explicit exception to "modules own their tables." All three are append-mostly (`activities` rarely updates; `audit_log` is append-only) and have well-defined contracts.

### 3.4 Storage of files — dual-source R2 + Google Drive

Two storage backends, one `files` table.

| Use case | Backend | Why |
|---|---|---|
| **System-generated** (invoice PDFs, pay stubs, exports, AI-generated summaries) | Cloudflare R2 | Programmatic, S3-compatible SDK, no egress fees, signed URLs. |
| **User-uploaded** (receipts, ticket attachments, scanned contracts) | Cloudflare R2 | Same reason. Programmatic access from the app. |
| **User-curated linked references** (contracts negotiated in Drive, client deliverables, reference docs that already live in Drive) | Google Drive (linked, not copied) | You already work there. Don't force a duplicate. |

The `files` table has columns:

```
files
├── id                  uuid PK
├── kind                enum: 'r2_owned' | 'drive_linked'
├── r2_key              text NULL    -- non-null when kind = 'r2_owned'
├── drive_file_id       text NULL    -- non-null when kind = 'drive_linked'
├── drive_account_id    uuid NULL    -- which connected Google account
├── filename            text
├── mime_type           text
├── size_bytes          bigint
├── created_by_user_id  uuid FK
├── created_at          timestamptz
└── ...
```

A check constraint enforces exactly one of `r2_key` or `drive_file_id` is non-null. Other tables (`expense_entries.receipt_file_id`, `crm_contracts.signed_pdf_file_id`, `support_ticket_messages` attachments) FK into `files.id`.

Drive integration is OAuth-per-user. Phase 1 ships read-only Drive linking (browse, pick, attach). Phase 2 adds two-way sync if needed. ADR-0004 documents this decision.

### 3.5 Background jobs

**pg-boss** running in the same Postgres database. Reasons:
- Zero new infrastructure
- Transactional job enqueue (the same transaction that creates the invoice enqueues the email)
- Adequate throughput for our scale (Phase 1 ~100 jobs/day, Phase 5 ~10K jobs/day)
- Migration to Inngest later is an interface swap, not a rewrite

Jobs are defined in each module's `events/` directory. The job worker is a single Node process started by Vercel cron or a Railway worker dyno.

---

## 4. Event architecture

### 4.1 Why events at all

Three of the five differentiators in the vision doc (activity-centric, AI-native, cross-business insights) require that side effects be decoupled from the action that triggered them. When `billing.invoice.paid` fires, the system needs to:

- Append a `payment_received` activity to the customer's timeline
- Update accounts receivable in the dashboard
- Send a thank-you email
- Trigger an AI suggestion to upsell related services
- Recompute the quarterly tax estimate

None of those should be invoice module's concern. They're each a separate subscriber.

### 4.2 Event topology

```
            ┌────────────────────────────────────┐
            │  Domain events (~40 across modules)│
            ├────────────────────────────────────┤
            │  parties.party.created             │
            │  parties.party.role_added          │
            │  finance.expense.created           │
            │  finance.expense_report.submitted  │
            │  finance.expense_report.approved   │
            │  billing.timesheet.submitted       │
            │  billing.timesheet.approved        │
            │  billing.invoice.sent              │
            │  billing.invoice.paid              │
            │  billing.payment.received          │
            │  billing.subscription.created      │
            │  billing.subscription.renewing     │
            │  billing.subscription.renewed      │
            │  billing.subscription.lapsed       │
            │  billing.subscription.canceled     │
            │  crm.opportunity.stage_changed     │
            │  crm.opportunity.won               │
            │  crm.contract.signed               │
            │  crm.contract.renewing             │
            │  support.ticket.created            │
            │  support.ticket.solved             │
            │  marketing.lead.captured           │
            │  marketing.campaign.sent           │
            │  hr.employee.hired                 │
            │  payroll.pay_run.completed         │
            │  ...                                │
            └────────────────┬───────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                  ▼
     In-process synchronous            pg-boss durable job
     subscribers (same TX)             (separate TX, retried)
     • activity logger                 • email sender
     • audit logger                    • AI suggestion runner
     • metric updater                  • webhook delivery
                                       • report cache invalidation
                                       • subscription renewal reminder
```

Two delivery modes:
- **Synchronous in-process:** for things that must succeed-or-fail with the originating mutation (writing to `activities`, writing to `audit_log`). These run inside the same DB transaction.
- **Asynchronous via pg-boss:** for things that may be retried, may take time, or may call external APIs (sending email, calling Anthropic, recomputing analytics rollups, sending renewal reminders).

### 4.3 Event naming

`{module}.{entity}.{verb_past_tense}`. Examples: `billing.invoice.paid`, `parties.party.created`, `crm.contract.signed`. Locked.

### 4.4 Event payload schema

Every event has a Zod schema in `src/modules/{module}/events/schemas.ts`. Subscribers receive a typed payload. Schemas are versioned with a `v` field; breaking changes bump the version and run subscribers in parallel for one release.

---

## 5. Consulting engagement lifecycle (cross-module)

This is the single most important workflow in the system. It spans CRM → Billing → Finance, and it's why we built CRM-lite into Phase 1 instead of deferring to Phase 2.

### 5.1 The lifecycle

```
CRM module                     Billing module           Finance module
──────────                     ──────────────           ──────────────

Opportunity (Lead)
  ↓ qualify
Opportunity (Qualified)
  ↓ proposal sent
Opportunity (Proposal)
  ↓ negotiate
Opportunity (Won)
  │
  │  on stage = Won, create:
  ▼
Contract                       
  - end_client_party_id
  - vendor_party_id (nullable)
  - rate_card_id
  - start_date, end_date
  - signed_pdf_file_id
  - status: Draft → Active → Renewed/Expired/Terminated
  │
  │  on status = Active, create:
  ▼                            ─────────────────►
                               Project
                                 - contract_id
                                 - end_client_party_id
                                 - vendor_party_id
                                 - business_line_id
                                 - start_date, end_date
                                 - status, budget_hours
                                 - default_billable_rate_cents
                                 │
                                 │  daily entry
                                 ▼
                               Time Entries (project_id, date, hours)
                                 │
                                 │  weekly approval
                                 ▼
                               Timesheet (status, week_starting)
                                 │                       
                                 │  also accumulates:    
                                 │  ◄────────────────────  Expense Entries
                                 │                          (project_id,
                                 │                           is_billable = true)
                                 │
                                 │  on monthly invoice generation:
                                 ▼
                               Invoice
                                 - bill_to_party_id (Vendor or End Client)
                                 - project_id (denormalized)
                                 - invoice_lines reference time + expenses
                                 │
                                 │  on payment received:
                                 ▼
                               Payment ──────────────► Journal Entry
                                                       (Revenue + AR)
```

### 5.2 The Project Health view (Phase 1 dashboard tile)

A single tile that JOINs across modules for a selected project:

| Field | Source |
|---|---|
| Project name, dates, status | `billing_projects` |
| Contract reference, terms | `crm_contracts` |
| End Client, Vendor | `parties` (via FKs on contract) |
| Burn % | `SUM(time_entries.hours) / projects.budget_hours` |
| This-week hours | `time_entries` filtered by week |
| Last invoice, last payment | `billing_invoices`, `billing_payments` |
| Open billable expenses | `finance_expense_entries` where billable + uninvoiced |
| Margin YTD | revenue − expenses for project, per period |

This view is the single most important screen for the consulting business. It justifies every cross-module FK we added.

### 5.3 Schema commitments arising from this lifecycle

| Commitment | Where |
|---|---|
| `billing_projects.contract_id` FK to `crm_contracts.id` | Billing schema |
| `billing_invoice_lines.project_id` FK to `billing_projects.id` | Billing schema |
| `billing_invoices.project_id` (denormalized for fast filter) | Billing schema |
| `finance_expense_entries.project_id` FK to `billing_projects.id` | Finance schema (cross-module FK; allowed) |
| Index on `billing_time_entries (project_id, date)` | Billing schema |
| Index on `finance_expense_entries (project_id, date)` | Finance schema |
| `crm_opportunities.business_line_id` to enable per-line pipelines | CRM schema |
| `crm_contracts` table with rate_card_id, signed_pdf_file_id, renewal_terms | CRM schema |
| `crm_rate_cards` table (versioned) | CRM schema |

The data-model artifact (#6) will codify all of these.

---

## 6. AI architecture (first-class module)

### 6.1 Why this gets its own section

Per your decision in Step 1, AI is a Phase 1 substrate. Every module gets AI hooks from day one. ADR-0003 records the decision.

### 6.2 The `ai` module's responsibilities

- Owns `ai_runs` (every LLM call) and `ai_suggestions` (outputs tied to entities)
- Owns embedding columns and the vector index (Postgres `pgvector`)
- Provides typed wrappers around providers (Anthropic, OpenAI)
- Tracks cost and latency per run
- Enforces per-module budgets ("CRM may spend at most \$X/day on AI calls")

### 6.3 How other modules use AI

```
src/modules/finance/actions/createExpense.ts
  ┌──────────────────────────────────────────────┐
  │  User creates expense without an account_id  │
  └────┬─────────────────────────────────────────┘
       │  emits finance.expense.created
       ▼
src/modules/ai/subscribers/categorizeExpense.ts
  ┌──────────────────────────────────────────────┐
  │  Listens for finance.expense.created without │
  │  account_id. Calls ai/run with a prompt.     │
  │  Writes ai_suggestions row with proposed     │
  │  account_id + confidence. Does NOT mutate    │
  │  the expense.                                │
  └──────────────────────────────────────────────┘
       │
       ▼
src/modules/finance/api/getSuggestions.ts
  ┌──────────────────────────────────────────────┐
  │  UI fetches pending suggestions for an       │
  │  expense; user accepts or rejects.           │
  │  Acceptance triggers finance/actions/        │
  │  applyAccountSuggestion.                     │
  └──────────────────────────────────────────────┘
```

### 6.4 Hard rules

- **AI never writes business data directly.** Suggestions go into `ai_suggestions`. A user (or, Phase 5, a workflow rule) accepts the suggestion, which triggers a normal mutation.
- **Every AI call is logged.** No untracked LLM calls anywhere in the codebase.
- **Costs are visible per module.** The AI module exposes `ai/api/costSummary` for the reporting dashboard.
- **Provider is swappable.** All calls go through `ai/lib/providers/`; never direct SDK imports outside that directory.

---

## 7. Authentication & authorization

### 7.1 Authentication

**Better Auth.** Single user (Venkata) at launch. Email + password + 2FA mandatory for the Owner role. Sessions are DB-backed (in `auth_sessions`). No JWTs in cookies — opaque session tokens only, server-side validated.

**Google OAuth** is wired in Phase 1 for **Drive integration only**, not as a login method. Users log in with email + password; they connect Google as a separate "linked account" for Drive access. Phase 5 may add Google as a login provider; deferring now to keep the Phase 1 surface small.

### 7.2 Authorization

Five roles defined in glossary Section 12. Implemented via:

- A `permissions` constant map (TypeScript) that defines what each role can do per module
- A tRPC middleware `requirePermission(module, action)` that checks the calling user's roles
- A Server Action helper `withPermission(module, action, fn)` that wraps mutations
- A UI helper `<Authz module="finance" action="write">` that conditionally renders

A Phase 2 ADR will document the permission matrix in detail. Phase 1 ships with the Owner role wired end-to-end and the other four roles seeded but un-tested.

### 7.3 Multi-user readiness

Schema reserves `users.id` everywhere user attribution matters (audit log, activities, ownership of opportunities/tickets/etc.). When Poornima logs in for the first time, no migration runs.

---

## 8. Deployment topology

### 8.1 Recommended: Vercel + Railway

| Component | Where | Why |
|---|---|---|
| Next.js app | **Vercel** | Best Next.js host. Free for our scale through Phase 1. Edge cache, automatic preview deploys. |
| Postgres 16 | **Railway** | Cheap (\$5/mo seed), upgradable, native pgvector. Daily backups included. |
| pg-boss worker | **Railway** worker service | Long-running Node process. \$5/mo. Connects to the same Railway Postgres. |
| Cloudflare R2 | **Cloudflare** | S3-compatible, no egress fees. Free tier covers Phase 1. |
| Postmark | **Postmark** | \$15/mo minimum. Best-in-class deliverability and inbound webhook quality. |
| Domains/DNS | **Cloudflare** | Free. CDN-front R2 if we need public file URLs. |
| Google Drive | **OAuth per user** | No infrastructure cost; uses the user's Google quota. |

Estimated infrastructure cost through Phase 1: **\$25–\$40/month**.

### 8.2 Environments

- **Local** — Postgres in Docker, R2 mocked with a local MinIO container, Postmark sandbox token, Drive OAuth pointing at a test account
- **Preview** — every PR gets a Vercel preview URL pointing at a shared dev DB
- **Production** — locked-down Railway DB, real R2, real Postmark

### 8.3 Secrets

Vercel environment variables for app secrets. Railway variables for the worker. No secrets in the repo. `.env.example` documents required vars; `lib/env.ts` validates with Zod at startup.

Per-user OAuth tokens (Google Drive, future Gmail) are stored encrypted in `auth_oauth_tokens` with a per-row encryption key derived from the user's password hash + a master key in Vercel env. Refresh tokens never leave the server.

---

## 9. Observability

### 9.1 Phase 1 minimum

- **Logs:** Vercel built-in for the app, Railway logs for the worker. Structured JSON via Pino. Trace IDs propagated through tRPC and pg-boss jobs.
- **Errors:** Sentry, free tier. Both client and server.
- **Performance:** Vercel Analytics for page TTI. Custom timing metrics in `lib/metrics.ts` for tRPC procedures.
- **Database:** Railway's built-in metrics + manual `pg_stat_statements` queries when investigating slow queries.

### 9.2 Phase 4+ additions

- PostHog for product analytics + session replay
- OpenTelemetry distributed tracing if module count grows
- Custom uptime monitor (BetterStack, \$5/mo)

---

## 10. Performance budget

The vision doc set targets. Architecture commitments to hit them:

| Target | Architectural commitment |
|---|---|
| Page TTI < 2s | Server Components by default; Client Components only for interactivity. shadcn/ui (no heavy CSS-in-JS runtime). Streaming SSR for slow data. |
| API p95 < 300ms | tRPC procedures must declare their data needs explicitly. No N+1 queries. Drizzle relational queries used for fetch-with-relations. Indexes on every FK + every WHERE/ORDER BY column. |
| Dashboard < 1s with 12mo data | Pre-computed daily rollups in `reporting_rollups` table, refreshed by a pg-boss job on event triggers. Dashboard tiles read rollups, not raw transactions. |
| 100K activity rows | `activities` table partitioned by `occurred_at` month. Index on `(party_id, occurred_at DESC)`. Cursor pagination only — no OFFSET. |
| Project Health tile < 500ms | Materialized view `mv_project_health` refreshed on relevant events. |

---

## 11. Multi-tenant readiness (without building it)

We're single-tenant today. Decisions made now to keep multi-tenant viable later:

- Every primary entity has an `organization_id` column populated with the singleton Varahi Group ID. Today this is a no-op constraint; it makes the future migration purely additive.
- All queries filter by `organization_id` even though there's only one. Implemented at the Drizzle relational layer so it's automatic.
- File storage keys include the org ID (`r2://cxallies-prod/{org_id}/receipts/{file_id}`).
- Auth, audit, and activities all scoped by `organization_id`.

Cost of this discipline: ~5% extra schema noise. Cost of skipping it: a 3-month rewrite when the SaaS pivot lands.

---

## 12. What's explicitly NOT in this architecture

| Thing | Why not | When it might be |
|---|---|---|
| **Microservices** | Architectural seams support extraction (per-module public API + events). Operational cost not justified for one operator. ADR-0001 captures the deferral and the trigger conditions for revisiting (team ≥ 6, hard isolation requirements like PCI/HIPAA, per-tenant deployment for SaaS). | Reconsider when ≥ 1 trigger condition is met. |
| GraphQL | tRPC gives us typed RPC for free. | If we need third-party API consumers in Phase 5+. |
| Redis | pg-boss + Postgres covers queueing and caching at our scale. | When Postgres CPU > 60% sustained. |
| Kubernetes | Vercel + Railway is simpler. | Never for this product. |
| Separate frontend/backend repos | Single Next.js app keeps types end-to-end. | Never. |
| **Shipping module** | Demoted from Phase 4 module. Pravara.ai might ship merch eventually but volume is unknown. Consulting deliverables don't ship. | Phase 4+ when real fulfillment volume materializes. New ADR required. |
| Server-Sent Events / WebSockets | No real-time requirement in Phase 1. | Phase 5 if we add live ticket collaboration. |
| Federated identity (SAML/SSO) | Two users, one Google account each. | Phase 5 if we add team customers in SaaS pivot. |
| **Gmail outbound** | Postmark deliverability is materially better for transactional. | Never; you keep using Gmail personally outside the system. |
| **Gmail inbound (Phase 1)** | Phase 1 has no tickets or CRM activities to receive. | Phase 2; ADR-0005 will compare Postmark inbound vs Gmail API. |

---

## 13. ADRs that codify these decisions

Written or planned before code begins:

- [ADR-0001 — Modular monolith over microservices](./adr/0001-modular-monolith.md) (next artifact)
- [ADR-0002 — Drizzle over Prisma](./adr/0002-drizzle-over-prisma.md)
- [ADR-0003 — AI as a first-class module](./adr/0003-ai-first-class-module.md)
- [ADR-0004 — Dual-source storage: Cloudflare R2 + Google Drive](./adr/0004-storage-r2-and-drive.md)

Pending; written when the decision is forced:

- ADR-0005 — Inbound email: Postmark vs Gmail API (Phase 2)
- ADR-0006 — Subscription billing engine design (when first non-trivial subscription ships)
- ADR-0007 — Permission model and policy storage (Phase 2)
- ADR-0008 — Multi-tenant migration plan (whenever the SaaS pivot is real)

---

## 14. Changelog

### v2 (this version)
- **Module count: 9 → 11.** Added `hr` (Phase 4 placeholder; Phase 1 skeleton). Removed `shipping` from active module list (deferred to future).
- **CRM scope expanded.** Added Contracts, Rate Cards, Opportunity (replaces "Deal" as canonical term). Phase 1 ships CRM skeleton (contracts + opportunity-as-Won) to support the consulting engagement lifecycle.
- **Subscriptions added** as a sub-domain of `billing` from Phase 1.
- **Storage: dual-source R2 + Google Drive** (§3.4). New ADR-0004.
- **Microservices** explicitly considered and deferred (§12). ADR-0001 will document the consideration with trigger conditions for revisiting.
- **Gmail inbound deferred** to Phase 2 with ADR-0005 placeholder.
- **Consulting engagement lifecycle** added as §5 — the cross-module workflow that drove most of the Phase 1 scope expansions.

### v1
- Initial architecture. 9 modules. Single-source R2. No subscriptions section. CRM full-only in Phase 2.

---

## 15. What's missing? What's wrong? What do we do next?

Three places I want explicit pushback before locking:

1. **"Deal" → "Opportunity" rename.** Industry-standard CRM uses "Deal" (HubSpot, Pipedrive). SAP and traditional B2B use "Opportunity." Your background leans Opportunity; your potential SaaS market may lean Deal. Pick one. I lean Opportunity for accuracy; pick the other if branding wins.

2. **CRM-lite in Phase 1.** I'm shipping `crm_contracts`, `crm_rate_cards`, and `crm_opportunities` (the Won-stage record) in Phase 1 because the consulting business depends on them. This expands Phase 1 scope by ~15%. If you'd rather defer everything CRM to Phase 2 and use a "fake contract" pattern in Billing for Phase 1, say so — it's simpler now, more painful later.

3. **Subscriptions schema in Phase 1, UI deferred.** I'm shipping the four subscription tables in Phase 1 even though there are no subscribers yet. This adds ~5% to Phase 1 schema work. Alternative: defer the entire subscriptions sub-domain to Phase 3. I lean ship-now because retainers are a subscription pattern and you may have one.

Reply with corrections or "go" and I produce ADR-0001 (modular monolith over microservices) next.
