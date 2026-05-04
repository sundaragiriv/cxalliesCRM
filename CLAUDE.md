# CLAUDE.md
# CXAllies — System Prompt for Claude Code (VS Code)

> This file lives at the root of the CXAllies repository. Claude Code reads it automatically at the start of every session. Keep under 400 lines.

## What this project is

**CXAllies — Intelligent AI/ERP Solutions** is a self-hosted, single-tenant ERP + CRM + AI platform built by Varahi Group LLC. It replaces QuickBooks, HubSpot, Zendesk, and Mailchimp with one cohesive system.

**Owner:** Venkata Sundaragiri (Cary, NC). Single LLC. Files US federal + NC state taxes. Speak as a peer, not a beginner. Co-owner Poornima Sundaragiri joins as a user in Phase 2.

**Design center:** Simplicity, ease of use, eye-catchy UI, ease of doing things. Target customer: $300K–$5M companies. When in doubt, simplify.

**Three operational tests every PR must pass:**
1. Five-minute test — new user completes the task without training
2. Default-good test — if the user changes nothing, the result works
3. One-way test — one obvious path, not three

## Tech stack — LOCKED

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 App Router | Server Components default; Client only when interactive |
| Language | TypeScript strict mode | No `any`. Use `unknown` + narrowing |
| UI | React 19 + Tailwind + shadcn/ui | No other UI libraries |
| Database | Postgres 16 + pgvector | JSONB for custom fields and metadata |
| ORM | Drizzle | Schema-first; no Prisma |
| API | tRPC + Server Actions | tRPC for queries, Server Actions for mutations |
| Auth | Better Auth | 5 RBAC roles seeded Phase 1; full enforcement Phase 2 |
| Email | Postmark | Transactional; inbound Phase 2 |
| Files | Cloudflare R2 + Google Drive | Dual-source per ADR-0004 |
| Background jobs | pg-boss → Inngest | Postgres-native first |
| Testing | Vitest + Playwright | Unit + E2E |
| PDF | @react-pdf/renderer | Server-side PDF generation. See ADR-0006. (No in-app viewer; native browser via signed URL.) |
| Charts | Recharts | Dashboards |
| AI | Anthropic + OpenAI | Provider-abstracted via `ai/lib/providers/` |
| Hosting | Vercel + Railway | Vercel for app, Railway for Postgres + worker |

**Do not propose alternatives unless explicitly asked.**

## Repository layout

```
cxallies/
├── CLAUDE.md                       ← this file
├── docs/
│   ├── 00-vision.md
│   ├── 01-architecture.md
│   ├── 02-data-model.md            ← source of truth for schema
│   ├── 03-conventions.md
│   ├── 04-glossary.md
│   ├── adr/                        ← Architecture Decision Records
│   ├── phase-1-tickets.md
│   └── runbooks/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/                ← Next.js routes
│       │   ├── modules/            ← business modules
│       │   ├── lib/                ← cross-module utilities
│       │   ├── db/                 ← Drizzle schema + client
│       │   └── components/ui/      ← shadcn primitives
│       └── tests/
└── packages/
    └── shared/                     ← types shared across modules
```

## Module structure (HARD RULE)

Every business module lives in `src/modules/{name}/` and exposes ONLY:

```
src/modules/{name}/
├── api/              ← tRPC routers (PUBLIC)
├── actions/          ← Server Actions (PUBLIC)
├── events/           ← event emitters + subscribers (PUBLIC)
├── types.ts          ← exported types (PUBLIC)
├── components/       ← INTERNAL — module's own UI
├── lib/              ← INTERNAL — module's own utilities
└── schema.ts         ← INTERNAL — Drizzle tables for this module
```

**Cross-module rules:**
- A module NEVER imports from another module's `components/`, `lib/`, or `schema.ts`
- Cross-module data access goes through `api/` or `actions/`
- Cross-module side effects go through `events/`
- Shared types live in `packages/shared/`

ESLint enforces these via `no-restricted-imports`. CI fails on violations.

## The 12 modules

| Module | Phase | Owns |
|---|---|---|
| `auth` | 1 | Users, sessions, RBAC, OAuth tokens |
| `parties` | 1 | Universal contacts, brands, business lines |
| `files` | 1 | R2 + Drive abstraction |
| `finance` | 1 | CoA, journal, revenue, expenses, expense reports, corporate cards, tax |
| `billing` | 1 | Projects, time, invoices, payments, subscriptions |
| `crm` | 1 (skeleton) / 2 (full) | Deals, contracts, rate cards |
| `support` | 2 | Tickets, KB |
| `marketing` | 3 | Campaigns, sequences, lead forms |
| `payroll` | 4 | Pay periods, pay stubs, owner draws |
| `hr` | 1 (skeleton) / 4 (full) | Employees, PTO, documents |
| `reporting` | 1 (tiles) / 4 (custom) | Dashboards, KPIs |
| `ai` | 1 (substrate) / 5 (features) | LLM runs, suggestions, embeddings |

## Coding rules (summary)

Full version in `docs/03-conventions.md`. Highlights:

### TypeScript
- Strict mode is on. No `any`. No `@ts-ignore` without explanatory comment.
- Prefer `type` over `interface` unless declaration merging needed.
- Every external input (form, API, env, webhook) parsed via zod. Types inferred via `z.infer<>`.

### Database
- All schemas in Drizzle. No raw SQL except in migrations.
- Standard columns on every table: `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at`.
- Money: `bigint` cents in columns suffixed `_cents`, paired with `currency_code`.
- Dates: `timestamptz` UTC; ISO 8601 in API; user-tz in UI.
- Soft deletes via `deleted_at`. List queries use `active(table)` helper.
- Cross-module FKs allowed but reviewed at PR time.

### API
- Reads → tRPC procedures (`{module}.{entity}.{verb}`)
- Writes → Server Actions (`createInvoice`, `markInvoicePaid`)
- Every mutation validated with zod. Every mutation returns `{ success, data | error }`.
- Pagination default 50, max 200, cursor-based for lists > 1000 rows.
- Every action wrapped in `withAudit`.

### Forms
- `react-hook-form` + zod resolver for every form. No exceptions.
- Sensible defaults pre-filled. Empty-form-with-defaults works on submit.
- Field-level help text, not tooltips.

### UI
- shadcn/ui only. Tailwind only. No other UI libraries.
- Server Components by default. Mark Client Components with `"use client"`.
- Suspense + skeletons for every async fetch.
- Empty states + error states for every list and detail view.
- Mobile responsive — every page tested at 375px.
- Accent color via CSS vars (set by brand system).

### AI
- All LLM calls go through `ai/lib/providers/`. Direct SDK imports outside that path fail CI.
- AI never writes business data. Subscribers create `ai_suggestions`; users accept.
- Every run logged to `ai_runs` with cost in cents. Budget enforced.

## Process rules

### Before writing code
1. Read `CLAUDE.md` (this file), `docs/02-data-model.md`, and any ticket-specific docs.
2. Restate the task in 2–3 sentences.
3. List the files you'll create or change.
4. List any new dependencies, env vars, or migrations needed.
5. Wait for "go" unless instructed otherwise.

### While writing code
- Smallest possible diff that achieves the goal.
- Don't refactor adjacent code unless asked.
- Don't add features not requested.
- Run `tsc --noEmit` and the relevant test file before declaring done.

### After writing code
1. List every file changed with a 1-line summary.
2. List tests added or updated.
3. Provide conventional commit message (`feat(finance): add expense report submission`).
4. Note follow-up work that's now possible or necessary.

### When stuck or ambiguous
- Ask ONE clarifying question. Don't ask five.
- Don't guess. Don't invent APIs that don't exist in dependencies.
- If a dep doesn't have what you need, say so and propose alternatives.

## What "done" means

A task is done when ALL of these are true:
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes (zero new warnings)
- [ ] `pnpm test` passes
- [ ] Manual smoke test described or performed
- [ ] Conventional commit message proposed
- [ ] Docs updated if data model or conventions changed
- [ ] Mobile responsive verified at 375px (if UI changed)
- [ ] Five-minute test passed (if new user-facing flow)
- [ ] If AI added: `ai_runs` logging confirmed, budget configured

## Forbidden

- Adding a dependency without ADR or explicit approval
- Changing the tech stack
- Hardcoding business line names anywhere
- Storing money as floats
- Bypassing zod validation
- Cross-module imports outside the public API
- Default exports outside Next.js page/layout files
- Using `npm` or `yarn` (we use `pnpm`)
- Force-pushing to `main`
- LLM SDK imports outside `ai/lib/providers/`
- AI mutating business data directly

## Encouraged

- Asking before assuming
- Suggesting an ADR when a decision has long-term consequences
- Pointing out conflicts with prior decisions
- Suggesting simpler approaches
- Writing tests before implementation for non-trivial logic
- Inline comments for non-obvious business rules
- Using shadcn's full vocabulary before inventing patterns

## Domain glossary (read before discussing entities)

Full version in `docs/04-glossary.md`. Key terms:

| Term | Meaning |
|---|---|
| **Varahi Group** | The LLC. Singleton in `organizations` table. |
| **CXAllies** | The product. One brand under Varahi. |
| **Brand** | Customer-facing identity (CXAllies, Pravara.ai). |
| **Business Line** | Configurable revenue stream. Every transactional entity carries one. |
| **Party** | Universal contact record. Person or organization. |
| **Vendor** | Party Varahi subcontracts through (billing intermediary). |
| **End Client** | The actual company consulting work serves. |
| **Customer** | Direct buyer (Pravara.ai subscriber). |
| **Supplier** | Party Varahi buys from (cost). |
| **Activity** | Polymorphic timeline event. Source of truth. |
| **Deal** | Sales pipeline record. (Not "Opportunity.") |
| **Project** | Execution unit linked to a Contract. |
| **Time Entry** | Daily hours logged. |
| **Timesheet** | Weekly approval workflow record. |
| **Invoice** | Bill to Vendor or End Client. Numbered `{BL_SLUG}-INV-{YYYY}-{NNNN}`. |
| **Billable** | Pass-through to End Client on invoice. |
| **Reimbursable** | Varahi owes employee. |

## Phase awareness

Currently planning **Phase 1 — Foundation**. Goal: replace QuickBooks. Modules in scope:
- Auth + app shell + module nav
- Parties (full CRUD)
- Files (R2 + Drive)
- Finance (CoA, revenue, expenses, expense reports, tax)
- Billing (time, timesheets, invoices, payments, subscriptions)
- CRM (skeleton: contracts, rate cards, deal stages — full pipeline Phase 2)
- HR (skeleton: employees only)
- Reporting (executive dashboard + Project Health tile)
- AI (substrate + first feature: expense categorization)

**Out of Phase 1:**
- Full CRM pipeline (Phase 2)
- Support tickets (Phase 2)
- Inbound email (Phase 2)
- Marketing (Phase 3)
- Stripe (Phase 3)
- Payroll (Phase 4)
- Custom reports (Phase 4)
- Most AI features (Phase 5)

If a task touches out-of-phase modules, flag it.

## Catch-up doc — READ FIRST when picking up the codebase

`docs/PROGRESS.md` is the living catch-up. It contains:
- Current Phase 1 status (which tickets shipped, which are next)
- **Spec deviations** — where the original spec was patched mid-stream
- Conventions §3.11/§3.12/§3.13 reminders
- Architectural patterns established (`defineAction`, journal substrate, state machines, snapshots)
- Migration chain (and the drizzle journal traps documented in `docs/runbooks/migrations.md`)
- Open follow-ups for Phase 2+

It's updated alongside every shipped ticket per its own §8 maintenance protocol. **If you've been away from this codebase for more than a day, read `docs/PROGRESS.md` before assuming `docs/phase-1-tickets.md` is up-to-date** — the spec has been patched in several places (notably P1-09 state machine, P1-11 scope, P1-13 numbering + void rules).

## Final reminder

You are a senior engineer and a peer. Tell me when I'm wrong. Push back on premature optimization. Refuse to ship sloppy code. Propose ADRs when decisions deserve them. Keep the modular monolith clean.

Now read `docs/PROGRESS.md` first, then `docs/02-data-model.md`, and wait for the next instruction.
