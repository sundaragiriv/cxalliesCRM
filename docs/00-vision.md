# CXAllies — Intelligent AI/ERP Solutions

> Vision document for the product being built by Varahi Group LLC.
> First user: Varahi Group itself. Future state: SaaS product for $300K–$5M companies.

## 1. What this is

CXAllies — Intelligent AI/ERP Solutions is a self-hosted, single-tenant ERP + CRM + AI platform that replaces a stack of disconnected SaaS tools (QuickBooks, HubSpot, Zendesk, Mailchimp, ShipStation, Calendly, Stripe Dashboard) with one cohesive system tailored to a multi-line operator.

It serves an owner-operator running multiple business lines from a single LLC. Today that's Varahi Group with four lines: SAP/AI consulting, Pravara.ai matrimony platform, websites portfolio, YouTube channel. Tomorrow it's any $300K–$5M company in the same shape.

## 2. The product is for

**Today (Phase 1–4):** Varahi Group LLC — owners Venkata Sundaragiri and Poornima Sundaragiri, located in Cary, NC. Both are W-2 employees of the LLC. Phase 1 is internal-use only.

**Future (Phase 5+):** $300K–$5M revenue companies operating multi-line businesses. Owner-operators who outgrew QuickBooks but can't justify the price or complexity of NetSuite, Sage Intacct, or Microsoft Dynamics.

The non-negotiable design center: **simplicity, ease of use, eye-catchy UI, ease of doing things.** Three tests every screen passes:
1. **Five-minute test** — new user completes the primary task without training
2. **Default-good test** — if the user changes nothing, do they get a working result
3. **One-way test** — one obvious way to do this thing, not three

## 3. The 12 modules

Eleven business modules plus one cross-cutting AI module:

| Module | Phase | Purpose |
|---|---|---|
| `auth` | 1 | Users, sessions, RBAC roles, OAuth tokens |
| `parties` | 1 | Universal contacts (vendors, clients, customers, employees, leads) |
| `finance` | 1 | Chart of accounts, journal entries, revenue, expenses, expense reports, corporate cards, tax estimates |
| `billing` | 1 | Projects, time entries, timesheets, invoices, payments, subscriptions |
| `crm` | 1 (skeleton) / 2 (full) | Deals, contracts, rate cards, pipelines |
| `support` | 2 | Tickets, knowledge base, canned responses |
| `marketing` | 3 | Campaigns, sequences, segments, lead forms, promotions |
| `payroll` | 4 | Pay periods, pay runs, pay stubs, owner draws |
| `hr` | 1 (skeleton) / 4 (full) | Employee records, PTO, documents |
| `reporting` | 1 (tiles) / 4 (custom) | Dashboards, KPIs, project health |
| `ai` | 1 (substrate) / 5 (features) | LLM provider abstraction, suggestions, embeddings |
| `files` | 1 | R2 + Google Drive dual-source storage |

## 4. The 5 phases

| Phase | Goal | Replaces | Duration target |
|---|---|---|---|
| **Phase 1 — Foundation** | Internal use, owner only | QuickBooks | 6 weeks |
| **Phase 2 — Customer Operations** | Add CRM pipeline, support, second user | HubSpot, Zendesk | 6 weeks |
| **Phase 3 — Growth** | Marketing, Stripe, Pravara.ai launch | Mailchimp, Stripe Dashboard | 6 weeks |
| **Phase 4 — Operations** | Payroll, HR, custom reports, bank reconciliation | ADP/Gusto-lite | 6 weeks |
| **Phase 5 — Automation** | AI features catalog, workflow engine, integrations | — | open-ended |

## 5. Architectural commitments (locked)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript strict |
| ORM | Drizzle (no Prisma) |
| Database | Postgres 16 + pgvector |
| UI | Tailwind + shadcn/ui (no other UI libs) |
| API | tRPC for queries, Server Actions for mutations |
| Auth | Better Auth |
| Email | Postmark |
| Files | Cloudflare R2 + Google Drive (dual-source) |
| Background jobs | pg-boss → Inngest |
| Hosting | Vercel + Railway |
| AI providers | Anthropic + OpenAI (provider-abstracted) |

Architecture is a **modular monolith** — one Next.js app, one Postgres database, modules separated by code boundaries. ADR-0001 documents why and lists the trigger conditions for revisiting (none of which are likely in 12+ months).

## 6. The 5 differentiators

What makes CXAllies different from the SaaS stack it replaces:

1. **Owner-operator first** — designed for one person who wears every hat
2. **Multi-business native** — every entity carries a business_line_id; reports work consolidated and split
3. **Activity-centric** — the timeline is the source of truth, not the per-module screens
4. **AI-native, not AI-bolted-on** — every module gets AI hooks from day one; suggestions never auto-mutate business data
5. **Owned and portable** — full export, self-hosted, your database, your rules

## 7. Phase 1 success metrics

By the end of week 6:
- 100% of consulting invoicing happens in CXAllies (zero in QuickBooks)
- < 30 seconds to record an expense from mobile
- < 5 minutes to enter a week of timesheets
- Quarterly tax estimate auto-calculated and on-screen
- Owner has not opened QuickBooks in 7 days

## 8. The brand portfolio

CXAllies is one product brand within Varahi Group LLC. The brand system uses:
- **Primary color** — Varahi Group anchor
- **Secondary color** — sub-brand identifier (CXAllies, Pravara.ai)
- **Tertiary color** — lighter version of secondary, for backgrounds and accents
- **Typography** — consistent across the portfolio

Phase 1 ships with placeholder palette (shadcn slate-with-blue). Brand assets applied in ticket P1-25, week 6.

## 9. What we explicitly are NOT building

- A microservices system (ADR-0001)
- A multi-tenant SaaS today (single-tenant; multi-tenant is a future migration)
- A workflow engine (Phase 5)
- A general-purpose ledger (single-entry recording, double-entry-ready schema)
- A shipping module (deferred indefinitely)
- A Gmail-based inbound system Phase 1 (Phase 2 with ADR-0005)
- A native mobile app (PWA only Phase 1)

## 10. Documents that anchor this work

- [`01-architecture.md`](./01-architecture.md) — system design, module boundaries, deployment
- [`02-data-model.md`](./02-data-model.md) — full Postgres schema in Drizzle
- [`03-conventions.md`](./03-conventions.md) — coding standards
- [`04-glossary.md`](./04-glossary.md) — locked vocabulary
- [`adr/`](./adr/) — architecture decision records
- [`phase-1-tickets.md`](./phase-1-tickets.md) — 27 atomic Phase 1 tickets
