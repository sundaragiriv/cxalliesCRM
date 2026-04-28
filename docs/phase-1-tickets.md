# CXAllies — Phase 1 Tickets

> Phase 1 ticket breakdown for **CXAllies — Intelligent AI/ERP Solutions**, a product of Varahi Group LLC.
> Goal of Phase 1: replace QuickBooks. Owner is the only user for 6 weeks.
> Each ticket is sized for one Claude Code session in VS Code (~half a day to a day of focused work).
> Read these in order. Tickets in the same section can be parallelized; tickets across sections cannot (later ones depend on earlier ones).
> All tickets follow the spec format from [`AI_Build_Playbook.md`](../AI_Build_Playbook.md) Part 5, Template B.

---

## 0. How to read this

| Field | Meaning |
|---|---|
| **ID** | `P1-XX` — Phase 1, sequential number. Used in branch names and commits. |
| **Goal** | One-sentence outcome. |
| **Module** | The primary module touched. |
| **Depends on** | Tickets that must merge before this one starts. |
| **Out of scope** | Things Claude Code might do that we explicitly don't want here. |
| **Acceptance** | Checklist that must be true to merge. |

The 26 tickets group into **9 sections** mapping to the build sequence. Sections 1–8 are sequential; section 9 (polish) waits for everything to land.

---

## Section 1 — Foundation (week 1)

### P1-01: Repository scaffold
**Goal:** A Next.js 15 + TypeScript + Tailwind + shadcn/ui repository that boots with `pnpm dev` and shows a working homepage.
**Module:** infrastructure
**Depends on:** —

**Scope:**
- Initialize Next.js 15 with App Router, TypeScript strict, Tailwind, shadcn/ui CLI
- Set up pnpm workspace structure: `apps/web`, `packages/shared`
- Add `docs/` directory with `00-vision.md`, `01-architecture.md`, `02-data-model.md`, `03-conventions.md`, `04-glossary.md`, `adr/0001` through `adr/0004` (already produced — drop them in)
- Add `CLAUDE.md` at repo root (no `.cursorrules` — Claude Code in VS Code is the sole AI tool per source-docs v2)
- Configure ESLint with the cross-module import rule from conventions §2.2
- Set up Vitest with one passing smoke test
- Set up Playwright config with one passing smoke test
- Configure GitHub Actions CI: lint, type check, unit tests
- README.md with quickstart

**Out of scope:**
- Database setup (P1-02)
- Auth (P1-04)
- Any business logic

**Acceptance:**
- [ ] `pnpm install && pnpm dev` shows the homepage
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] CI green on a sample PR
- [ ] All planning docs are in `docs/`

---

### P1-02: Database setup and shared primitives
**Goal:** Postgres + Drizzle wired up. `pnpm db:generate` and `pnpm db:migrate` work. No tables yet.
**Module:** db
**Depends on:** P1-01

**Scope:**
- Add Postgres dependency (`postgres`, `drizzle-orm`, `drizzle-kit`)
- Configure local Postgres via Docker Compose (`docker-compose.yml` for dev)
- Create `src/db/client.ts` — Drizzle client singleton
- Create `src/db/shared.ts` — shared column primitives per data-model §1
- Create `src/db/enums.ts` — all Postgres enums per data-model §2
- Configure `drizzle.config.ts`
- Add `db:generate`, `db:migrate`, `db:seed`, `db:studio` scripts to package.json
- Add `pgvector` extension to local DB

**Out of scope:**
- Any module schemas (P1-03)
- Connection pooling for production (P1-26 deploy ticket)

**Acceptance:**
- [ ] `docker compose up` starts Postgres
- [ ] `pnpm db:generate` runs successfully (no schema yet, but tooling works)
- [ ] `pnpm db:studio` opens Drizzle Studio
- [ ] `pgvector` extension installed
- [ ] All shared primitives and enums exported

---

### P1-03: Foundation schemas — auth, parties, files
**Goal:** All foundational module schemas in place. First migration runs successfully. Seed data loads.
**Module:** auth, parties, files
**Depends on:** P1-02

**Scope:**
- Create `src/modules/auth/schema.ts` per data-model §3
- Create `src/modules/parties/schema.ts` per data-model §4
- Create `src/modules/files/schema.ts` per data-model §5
- Create `src/db/shared-tables.ts` for `activities`, `audit_log`, `exchange_rates`
- Create `src/db/schema.ts` re-exporting all of the above
- Generate first migration via `drizzle-kit`
- Add the cross-module FK migration per data-model §15.5 (subset relevant to these modules only)
- Add full-text search trigger for `parties` per data-model §15.3
- Add `updated_at` trigger for all tables
- Create `src/db/seed/` directory
- Seed: `organizations` (Varahi Group), `brands` (CXAllies, Pravara.ai), `business_lines` (4 lines), `roles` (5 roles)

**Out of scope:**
- Other modules' schemas (P1-05)
- Any UI

**Acceptance:**
- [ ] `pnpm db:migrate` applies migrations cleanly
- [ ] `pnpm db:seed` populates seed data
- [ ] All tables visible in Drizzle Studio
- [ ] FTS trigger works (verified via raw SQL test)

---

### P1-04: Authentication with Better Auth
**Goal:** Owner can sign up, log in, log out, set up 2FA. Session persists.
**Module:** auth
**Depends on:** P1-03

**Scope:**
- Install Better Auth with Drizzle adapter
- Configure `src/lib/auth.ts` — Better Auth instance with email + password + 2FA TOTP
- Create login, signup, 2FA setup pages under `app/(public)/`
- Create `app/(authed)/layout.tsx` that requires session
- Implement `procedureWithAuth` middleware in `src/lib/trpc/middleware.ts`
- Implement `withPermission` Server Action helper in `src/lib/auth/with-permission.ts`
- Create permissions matrix in `src/lib/auth/permissions.ts` (5 roles, 11 modules)
- Seed Owner user (Venkata) with password from env var, plus Person-Party rows for Venkata and Poornima and the user→party link per data-model §16
- Add audit log middleware in `src/lib/audit/with-audit.ts`

**Out of scope:**
- OAuth (P1-15 for Google Drive)
- Password reset (P1-26 polish)
- Multi-user invites (Phase 2)

**Acceptance:**
- [ ] Owner can log in with email + password
- [ ] 2FA setup flow works end-to-end
- [ ] Session persists across page reloads
- [ ] Logging out destroys the session
- [ ] Hitting `(authed)` routes without session redirects to login
- [ ] Permissions matrix has unit tests
- [ ] Audit middleware writes to `audit_log` on a sample mutation

---

### P1-05: App shell, navigation, design tokens
**Goal:** Authenticated users see a polished app shell with sidebar nav. Design tokens defined for the brand system swap (P1-25).
**Module:** ui foundation
**Depends on:** P1-04

**Scope:**
- Build `app/(authed)/layout.tsx` with sidebar + topbar
- Sidebar nav for Phase 1 modules: Dashboard, Finance, Billing, CRM, Settings
- Topbar with user menu, notifications placeholder, search placeholder
- Define CSS variables in `globals.css` for brand colors (primary, secondary, tertiary), typography scale, spacing, radius
- Variables consumed by shadcn theme via `data-brand` attribute on `<html>`
- Default theme: shadcn slate-with-blue (placeholder until P1-25 brand system applies)
- Mobile responsive: sidebar collapses to drawer at < 768px
- Dark mode toggle (Tailwind `dark:` variants — shadcn supports this natively)
- Empty states, loading skeletons, error boundaries set up as primitives in `src/components/ui/`

**Out of scope:**
- Module-specific UI (later tickets)
- Search functionality (P1-22)
- Notifications (Phase 2)

**Acceptance:**
- [ ] Logged-in user sees the shell
- [ ] All Phase 1 nav items present (some link to placeholder pages)
- [ ] Mobile (375px) renders correctly with drawer nav
- [ ] Dark mode toggle works
- [ ] Five-minute test: Owner can find every Phase 1 module from the nav without instruction

---

## Section 2 — Finance core (week 2)

### P1-06: Finance schemas + Chart of Accounts seed
**Goal:** Finance module schema in place, seeded with a realistic 26-account chart of accounts.
**Module:** finance
**Depends on:** P1-03

**Scope:**
- Create `src/modules/finance/schema.ts` per data-model §6
- Generate migration
- Cross-module FKs: `expense_entries.project_id`, `expense_entries.invoice_id`, `revenue_entries.invoice_id`, etc. (declared in migration after billing tables exist — for Phase 1 we define them as nullable text temporarily and add the FK constraints in P1-08)
- Seed `chart_of_accounts` with 26 type-prefixed accounts:
  - 1xxx Assets (cash, AR, prepaid expenses)
  - 2xxx Liabilities (AP, payroll liabilities, taxes payable)
  - 3xxx Equity (owner equity, retained earnings, owner draws)
  - 4xxx Revenue (consulting, matrimony subscriptions, ad revenue, other)
  - 5xxx Expenses (travel, software, professional services, payroll, etc.)
- Seed `tax_rates` with federal + NC 2026 brackets

**Out of scope:**
- UI (P1-07, P1-08)
- Journal entry generation logic (P1-08)

**Acceptance:**
- [ ] All finance tables exist
- [ ] CoA seeded with 26 accounts, viewable in Drizzle Studio
- [ ] Tax rates seeded
- [ ] Migration is reversible by `git revert`

---

### P1-07: Expense entry — full CRUD with mobile-first UX
**Goal:** Owner can record an expense from mobile in under 30 seconds, including receipt upload.
**Module:** finance
**Depends on:** P1-06, P1-05

**Scope:**
- tRPC router: `finance.expenses.list`, `finance.expenses.get`, `finance.expenses.search`
- Server Actions: `createExpense`, `updateExpense`, `softDeleteExpense`
- Page: `/finance/expenses` — list with filter (date range, business line, billable, reimbursable), pagination
- Page: `/finance/expenses/new` — quick-add form with mobile-optimized layout
- Page: `/finance/expenses/[id]` — detail view with edit + receipt preview
- Form fields: date (default today), business line (default most-used), amount, description, account, payment source, billable + reimbursable flags, project (if billable), corporate card (if applicable), receipt upload
- Receipt upload via `<FilePicker>` (R2 — Drive linking ships in P1-15)
- Receipt preview supports PDF and images
- Unit tests for `createExpense`, `updateExpense` happy + error cases
- Vitest tests for any helper functions
- Playwright test: create expense end-to-end from mobile viewport

**Out of scope:**
- Expense reports (P1-09)
- Bulk import (Phase 2)
- AI categorization (P1-23)

**Acceptance:**
- [ ] Owner can create an expense in < 30 seconds at 375px width (manual test)
- [ ] List paginates, filters work, search works
- [ ] Receipt upload to R2 works
- [ ] Soft delete works (deleted item disappears from list, recoverable via DB)
- [ ] All mutations write `audit_log` rows
- [ ] All mutations emit `finance.expense.{created,updated,deleted}` events

---

### P1-08: Revenue entry + journal entry generation
**Goal:** Owner can record revenue. Each revenue entry produces a balanced journal entry automatically.
**Module:** finance
**Depends on:** P1-07

**Scope:**
- tRPC: `finance.revenue.list`, `finance.revenue.get`
- Server Actions: `createRevenueEntry`, `updateRevenueEntry`, `softDeleteRevenueEntry`
- Pages: `/finance/revenue`, `/finance/revenue/new`, `/finance/revenue/[id]`
- Auto-generate journal entry on revenue entry create:
  - Debit: Cash (or AR if not yet received)
  - Credit: Revenue account (per business line)
- Journal entry numbering: `JE-{YYYY}-{NNNNN}` (organization-wide sequence)
- Journal entries shown in `/finance/journal` (read-only list view)
- Same flow for expense entries: each expense entry generates a journal entry on payment (debit expense, credit cash)
- Helper: `src/modules/finance/lib/journal-builder.ts` — typed journal entry construction
- Vitest: journal entry generator with multiple business lines, currencies, payment statuses

**Out of scope:**
- Manual journal entry creation (Phase 2 — for adjustments)
- Reversals UI (Phase 2)

**Acceptance:**
- [ ] Creating a revenue entry creates a balanced journal entry
- [ ] Creating an expense entry (with payment) creates a balanced journal entry
- [ ] Journal entries are append-only (UI offers no edit)
- [ ] Sum of debits = sum of credits across all journal_lines (verified by SQL test)
- [ ] Journal entry list shows entries with their source

---

### P1-09: Expense reports + reimbursement workflow
**Goal:** Owner (or future employee) submits a trip's expenses as a single report. Approval flow + reimbursement record. The kickoff scope addition.
**Module:** finance
**Depends on:** P1-07

**Scope:**
- tRPC: `finance.expenseReports.list`, `finance.expenseReports.get`
- Server Actions: `createExpenseReport`, `addExpenseToReport`, `removeExpenseFromReport`, `submitExpenseReport`, `approveExpenseReport`, `rejectExpenseReport`, `markReimbursed`
- Pages: `/finance/expense-reports`, `/finance/expense-reports/new`, `/finance/expense-reports/[id]`
- Workflow: Draft → Submitted → Approved (or Rejected) → Reimbursed
- Smart helper: "create report from selected expenses" — checkbox-select on expense list page, button "create report"
- Email notification on approval (via Postmark — P1-12 sets that up; this ticket queues the notification only)
- Corporate card management UI: `/finance/cards` to add/edit cards
- Vitest: status transitions, "create from selected expenses" logic

**Out of scope:**
- Per-employee report views (Phase 2 when Poornima joins)
- Mileage tracking (Phase 5)
- Approval routing (Phase 2)

**Acceptance:**
- [ ] Owner can group expenses into a report
- [ ] Status transitions enforce valid state machine
- [ ] Reimbursed reports create a corresponding journal entry (debit owed-to-employee, credit cash)
- [ ] Corporate card CRUD works
- [ ] Five-minute test: from a list of expenses, owner can create + submit a report

---

### P1-10: Tax estimates module
**Goal:** Quarterly federal + NC state + self-employment tax estimates auto-recalculate on revenue/expense changes. Always visible on dashboard.
**Module:** finance
**Depends on:** P1-08

**Scope:**
- Helper: `src/modules/finance/lib/tax-calculator.ts` — pure function (income, expenses, year, quarter, filing status, state) → estimate
- Uses `tax_rates` seed data; bracket-aware calculation
- Includes self-employment tax (15.3% on net SE income)
- Page: `/finance/tax-estimates` — current quarter prominent, prior 4 quarters as table
- Auto-recompute on `finance.revenue.created`, `finance.expense.created`, etc. via pg-boss job
- Mark-paid action with payment reference
- Vitest: tax calculator with multiple scenarios (low income, high income, mixed quarters)

**Out of scope:**
- 1099-NEC tracking UI (Phase 4)
- Multi-year planning (Phase 5)
- Schedule C export (Phase 4)

**Acceptance:**
- [ ] Tax estimate updates within 30 seconds of a revenue entry
- [ ] Calculator passes test cases for: 0 income, $50k AGI, $150k AGI, $500k AGI scenarios
- [ ] Marking paid records the payment reference

---

## Section 3 — Billing core (week 3)

### P1-11: Billing + CRM schemas (data-only, no UI)
**Goal:** Billing and CRM module schemas in place. Cross-module FKs from finance back to billing/crm wired up. Deal stages seeded per business line via the template-then-materialize pattern.
**Module:** billing, crm
**Depends on:** P1-06

**Note:** Project + contract CRUD UI deferred to P1-12 where projects gain immediate utility via invoice line items and time-entry linkage. Shipping a "create project" form before time entries / invoices exist would fail the 5-minute test (the user has nothing to do with the project they just created).

**Scope:**
- Create `src/modules/billing/schema.ts` per data-model §5 (full: projects, time_entries, timesheets, invoices, invoice_lines, payments, payment_applications, subscription_plans, subscriptions, subscription_events, memberships)
- Create `src/modules/crm/schema.ts` per data-model §6 (full: deal_stage_templates + deal_stage_template_lines reference tables, deal_stages, deals, contracts, rate_cards, rate_card_lines)
- Generate `0015_billing_crm_tables.sql` via drizzle-kit
- Hand-write `0016_billing_crm_intra_module_fks.sql` for forward-reference FKs within the new modules
- Hand-write `0017_finance_billing_crm_cross_module_fks.sql` adding the deferred finance→billing FKs from P1-06 + `billing_projects.contract_id → crm_contracts.id` + `billing_payments.revenue_entry_id → finance_revenue_entries.id`
- Seed `crm_deal_stage_templates` with `consulting-pipeline` (Lead/Qualified/Proposal Sent/Negotiation/Won/Lost) and `subscription-pipeline` (Trial/Active/Churned)
- Helper `applyDealStageTemplate(orgId, businessLineId, templateSlug)` mirrors `applyChartOfAccountsTemplate`
- Seed materializes per BL: services → consulting-pipeline; subscription → subscription-pipeline; ad_revenue → skipped (no pipeline); other → consulting-pipeline fallback
- `scripts/verify-p1-11.ts` deliberately violates each new FK constraint to prove enforcement, and confirms Varahi's deal_stages were materialized for consulting/matrimony/cxallies but NOT for moonking-yt

**Out of scope:**
- Project + contract UI (P1-12)
- Time entry + timesheet workflow (P1-12)
- Invoice generation (P1-13)
- Subscription + rate card editor UI (P1-19 / Phase 2)
- Full deals pipeline UI (Phase 2)
- `nextProjectNumber` / `nextContractNumber` / `nextDealNumber` / `nextInvoiceNumber` / `nextPaymentNumber` helpers — added when their actions land

**Acceptance:**
- [ ] All billing + CRM tables exist in DB; visible in Drizzle Studio
- [ ] All deferred finance→billing FKs from P1-06 enforced
- [ ] `crm_deal_stage_templates` seeded with both templates
- [ ] Varahi org has materialized deal_stages for consulting/matrimony/cxallies (consulting-pipeline) and skipped moonking-yt (no pipeline for ad_revenue kind)
- [ ] FK violation test in `scripts/verify-p1-11.ts` passes (every new constraint rejects deliberate orphan inserts)

---

### P1-12: Time entries + weekly timesheet workflow
**Goal:** Owner logs daily hours per project. Weekly timesheet aggregation with submit + approve.
**Module:** billing
**Depends on:** P1-11

**Scope:**
- tRPC: `billing.timeEntries.list` (by week, by project), `billing.timesheets.list`, `billing.timesheets.get`
- Server Actions: `createTimeEntry`, `updateTimeEntry`, `softDeleteTimeEntry`, `submitTimesheet`, `approveTimesheet`, `rejectTimesheet`
- Page: `/billing/time` — weekly grid view (7 days × N projects), inline edit, keyboard navigation
- Page: `/billing/timesheets` — list of weekly timesheets with status
- Page: `/billing/timesheets/[id]` — detail with line-by-line entries
- "Submit week" button on the time grid view
- Timesheet status transitions enforce valid state machine
- Vitest: state machine, weekly aggregation logic

**Out of scope:**
- Per-employee timesheets (Phase 2)
- Time tracker (start/stop timer) (Phase 5)
- Mobile time entry (Phase 1 desktop-first; mobile lands in P1-25 polish)

**Acceptance:**
- [ ] Owner can enter a week of time in < 5 minutes (manual test)
- [ ] Submit moves all that week's entries to status `submitted`
- [ ] Approve moves them to `approved`
- [ ] Approved entries are eligible for invoicing

---

### P1-13: Invoice generation from approved timesheets + billable expenses
**Goal:** One-click "create invoice for project + period" that pulls all approved time entries and billable expenses into a draft invoice.
**Module:** billing
**Depends on:** P1-12, P1-09

**Scope:**
- Helper: `src/modules/billing/lib/invoice-generator.ts` — pure function (projectId, periodStart, periodEnd) → invoice draft
- tRPC: `billing.invoices.list`, `billing.invoices.get`
- Server Actions: `generateInvoiceFromProject`, `createInvoice` (manual), `updateInvoice`, `sendInvoice`, `markInvoicePaid`, `voidInvoice`
- Pages: `/billing/invoices`, `/billing/invoices/new`, `/billing/invoices/[id]`
- Invoice numbering: `{BL_SLUG}-INV-{YYYY}-{NNNN}` per business line
- "Generate from timesheets" workflow: pick project + period, preview lines, confirm, draft invoice created with all approved time + billable expenses linked
- Invoice PDF generation via react-pdf (P1-14 covers PDF generation in detail; this ticket creates the placeholder)
- Vitest: invoice generator with edge cases (empty period, partial billable, multi-currency)

**Out of scope:**
- Recurring invoice scheduling (Phase 3 with subscriptions)
- Stripe integration (Phase 3)

**Acceptance:**
- [ ] Generated invoice contains correct time entries (status changed to `invoiced`)
- [ ] Generated invoice contains correct billable expenses (linked via FK)
- [ ] Mark-paid creates a payment record + journal entry
- [ ] Five-minute test: invoice a project end-to-end without docs

---

### P1-14: Invoice PDF generation + email send via Postmark
**Goal:** Generated invoice produces a branded PDF. Sending an invoice emails the PDF to the bill-to party.
**Module:** billing, files
**Depends on:** P1-13

**Scope:**
- Install `react-pdf`
- PDF template: `src/modules/billing/lib/invoice-pdf.tsx`
- Template includes: Varahi Group letterhead, brand color accent, invoice number, dates, bill-to, line items, totals, payment terms, notes
- "Generate PDF" action stores in R2, links to `invoices.pdf_file_id`
- Postmark integration: `src/lib/email/postmark.ts` — typed wrapper
- Server Action `sendInvoice` generates PDF, attaches to email, sends via Postmark, status → `sent`, emits `billing.invoice.sent`
- Email template (transactional): plain text + HTML, includes link to view in browser (signed URL)
- Postmark sandbox token in dev; production token in env

**Out of scope:**
- Custom invoice templates per business line (Phase 5)
- Inbound email handling (Phase 2)
- Reminder emails (Phase 3)

**Acceptance:**
- [ ] PDF generation produces a clean, professional document
- [ ] PDF stored in R2, signed URL works
- [ ] Postmark send works in dev (sandbox)
- [ ] Email contains PDF as attachment + view-in-browser link
- [ ] Brand color CSS vars consumed by PDF template

---

### P1-15: Cloudflare R2 setup + Google Drive picker integration
**Goal:** R2 wired for production. Google Drive OAuth flow lets the owner attach Drive files to records.
**Module:** files
**Depends on:** P1-04

**Scope:**
- R2 buckets created (dev + prod), CORS configured
- AWS SDK v3 wired in `src/modules/files/lib/r2.ts`
- Server Actions: `uploadToR2`, `linkFromDrive`, `deleteFile`
- tRPC: `files.get`, `files.listForEntity`, `files.getDownloadUrl`
- Component: `<FilePicker>` — unified UI with "Upload" and "Pick from Drive" buttons
- Component: `<FilePreview>` — backend-aware preview
- Google Cloud OAuth client setup, scopes: `drive.file`
- Google Drive Picker API integration in `src/modules/files/lib/drive/picker.ts`
- OAuth flow: `connectGoogleAccount` Server Action, redirect handler
- Encrypted token storage with AES-256-GCM (master key in env)
- Page: `/settings/integrations` — connect/disconnect Google account
- Vitest: encryption round-trip, R2 client wrapper

**Out of scope:**
- Two-way Drive sync (Phase 2)
- Other OAuth providers (future)
- Drive file change webhooks (Phase 5)

**Acceptance:**
- [ ] Owner uploads a receipt to R2 from the expense form, sees it back
- [ ] Owner connects Google account in settings
- [ ] Owner picks a Drive file from the Drive picker, file appears in records
- [ ] Token encryption verified by test
- [ ] Disconnect flow revokes tokens

---

## Section 4 — CRM-lite + Project Health (week 4)

### P1-16: Parties (contacts) full CRUD
**Goal:** Owner manages all contacts (vendors, clients, customers, leads, employees) in one unified UI.
**Module:** parties
**Depends on:** P1-05

**Scope:**
- tRPC: `parties.list`, `parties.get`, `parties.search`
- Server Actions: `createParty`, `updateParty`, `softDeleteParty`, `addPartyRole`, `removePartyRole`
- Page: `/contacts` — unified list with role filter (Vendor, Client, Customer, etc.)
- Page: `/contacts/new` — kind toggle (Person vs Organization), conditional fields
- Page: `/contacts/[id]` — detail with tabs: Overview, Activity, Contracts, Invoices, Tickets (placeholder), Files
- "Activity" tab queries `activities` for the party_id (Customer 360 view)
- Custom fields editor (admin only): `/settings/custom-fields`
- Tags: inline tag picker on the detail page
- Full-text search via Postgres FTS

**Out of scope:**
- Bulk import (Phase 2 — CSV import)
- Deduplication (Phase 5)
- Email enrichment (Phase 5)

**Acceptance:**
- [ ] All party kinds creatable
- [ ] Multiple roles assignable
- [ ] Search returns relevant matches
- [ ] Activity tab shows real activity rows for the party

---

### P1-17: Project Health dashboard tile
**Goal:** The single most important screen for consulting — burn, hours, invoiced, margin per project.
**Module:** reporting
**Depends on:** P1-13, P1-16

**Scope:**
- Helper: `src/modules/reporting/lib/project-health.ts` — query that JOINs projects, contracts, parties, time entries, expenses, invoices, payments
- tRPC: `reporting.projectHealth.get` (single project), `reporting.projectHealth.list` (all active projects)
- Component: `<ProjectHealthTile>` rendering a single project's health
- Page: `/billing/projects/[id]` already exists; embed `<ProjectHealthTile>` at the top
- Page: `/dashboard` (executive dashboard, P1-18) shows top-3 active projects via this tile
- Computed fields: budget_used_pct, hours_this_week, last_invoice, next_invoice_estimate, open_billable_expenses_cents, margin_ytd_pct
- Vitest: project-health calculator with mock data

**Out of scope:**
- Forecasting (Phase 4)
- Variance analysis (Phase 5)
- Per-project P&L drill-down (Phase 4)

**Acceptance:**
- [ ] Tile shows all listed fields
- [ ] Tile renders in < 500ms with realistic data (P1-21 seeds synthetic data for testing)
- [ ] Mobile responsive
- [ ] Margin calculation matches spreadsheet for a known scenario

---

### P1-18: Executive dashboard v1
**Goal:** Owner opens the app, sees the state of the business in 5 seconds: revenue, AR, top projects, tax estimate, AI suggestions queue.
**Module:** reporting
**Depends on:** P1-17, P1-10

**Scope:**
- Page: `/dashboard` (also default authed route)
- Tiles:
  - "Revenue this month" — KPI with trend (vs prior month) per business line
  - "Accounts Receivable" — total AR, breakdown by aging bucket (0-30, 31-60, 61-90, 90+)
  - "Top 3 Active Projects" — Project Health tiles
  - "Quarterly Tax Estimate" — current quarter, due date prominent
  - "Recent Activity" — last 10 activities across all modules
  - "Pending AI Suggestions" — count + link to AI inbox (Phase 5; Phase 1 shows the empty state)
- All tiles support Server Component data fetching with Suspense
- Tile registration via `dashboard_tiles` rows seeded for the Owner's default dashboard
- Five-minute test: a fresh CXAllies install, with seeded data, shows a useful dashboard immediately

**Out of scope:**
- Custom dashboards (Phase 4)
- Tile rearrangement (Phase 4)
- Alerts/notifications (Phase 2)

**Acceptance:**
- [ ] Dashboard renders in < 1 second with 12 months of seeded data
- [ ] All tiles populate
- [ ] Mobile responsive (tiles stack)
- [ ] Empty states for new users (no data yet)

---

## Section 5 — Subscriptions + AI substrate (week 5, part 1)

### P1-19: Subscription management (schema + minimal UI)
**Goal:** Subscription plans defined. Owner can manually create/cancel a subscription. Renewal events fire on schedule.
**Module:** billing
**Depends on:** P1-13

**Scope:**
- Subscription tables already in P1-11; this ticket builds the UI + workflow
- tRPC: `billing.subscriptions.list`, `billing.subscriptions.get`, `billing.subscriptionPlans.list`
- Server Actions: `createSubscriptionPlan`, `createSubscription`, `cancelSubscription`, `pauseSubscription`, `resumeSubscription`
- Pages: `/billing/subscriptions`, `/billing/subscription-plans`
- pg-boss recurring job: daily check for subscriptions where `current_period_end <= today + 7 days`, emit `billing.subscription.renewing`
- pg-boss job: on `current_period_end <= today`, run renewal logic (create next period invoice if applicable)
- Subscription event log entries on each transition

**Out of scope:**
- Stripe integration (Phase 3)
- Self-service subscription portal (Phase 3)
- Dunning (failed payment retry) (Phase 3)

**Acceptance:**
- [ ] Owner can create a subscription plan
- [ ] Owner can attach a party to a plan as a subscription
- [ ] Renewal job fires on schedule (verified via test with mocked time)
- [ ] Status transitions log to `subscription_events`

---

### P1-20: AI substrate (no features yet)
**Goal:** AI module schema, provider abstraction, budget enforcement, audit logging — all wired but no user-visible AI features.
**Module:** ai
**Depends on:** P1-04

**Scope:**
- Create `src/modules/ai/schema.ts` per data-model §11
- Migration applied
- Install `@anthropic-ai/sdk` and `openai`
- Provider wrappers in `src/modules/ai/lib/providers/`:
  - `anthropic.ts`
  - `openai.ts`
  - `types.ts` (uniform interface)
- Budget enforcement in `src/modules/ai/lib/budget.ts`
- Server Action: `runFeature(featureName, input, opts)` — internal helper, called by subscribers
- Server Action: `acceptSuggestion(suggestionId)` — public, emits a feature-specific event
- Server Action: `rejectSuggestion(suggestionId)` — public
- tRPC: `ai.suggestions.listForEntity`, `ai.runs.list` (admin-only), `ai.budgets.get`
- Component: `<AiSuggestionPanel entityTable entityId>` — fetches and renders pending suggestions
- ESLint rule banning direct LLM SDK imports outside `ai/lib/providers/`
- Seed `ai_budgets` rows with default caps per module
- Vitest: budget enforcement, provider wrapper interface

**Out of scope:**
- Any AI feature implementation (P1-23 ships the first one)
- Embeddings indexing (P1-24 if scope permits, else Phase 5)

**Acceptance:**
- [ ] Schema migrated
- [ ] Budget enforcement blocks calls that exceed cap
- [ ] Provider wrappers are interchangeable (test calls Anthropic, swaps to OpenAI without code changes elsewhere)
- [ ] `<AiSuggestionPanel>` renders empty state with no suggestions

---

## Section 6 — Polish, AI feature, seeding (week 5, part 2)

### P1-21: Synthetic data seeding for dashboard validation
**Goal:** A seed script generates 12 months of realistic synthetic data so dashboards look real during dev.
**Module:** db
**Depends on:** P1-18

**Scope:**
- Script: `pnpm db:seed-synthetic` (separate from the production seed)
- Generates:
  - 4-6 contracts across business lines (consulting + matrimony)
  - 3-5 active projects
  - 12 months × 5 days/week × 4-8 hours of time entries
  - 200+ expense entries (mix of billable/non-billable, billable/non-reimbursable)
  - Monthly invoices generated from time + expenses
  - Payments received with realistic delay
  - 50 parties (mix of vendors, clients, customers, leads)
  - 1-2 subscriptions
  - Activity log populated as side effect
- Script is idempotent within a fresh DB; refuses to run if production-like markers exist
- README documents how to refresh local DB with synthetic data

**Out of scope:**
- Production data import (no Excel migration per kickoff decision)
- Faker-based name generation (use realistic but obviously-fake names like "Acme Industries" not real company names)

**Acceptance:**
- [ ] `pnpm db:seed-synthetic` produces a populated DB in < 30 seconds
- [ ] Dashboard shows realistic-looking data
- [ ] Project Health tile shows realistic burn percentages
- [ ] All seed data passes the same integrity checks production data must

---

### P1-22: Global search + recent items
**Goal:** Cmd-K opens a command palette that searches parties, invoices, projects, expenses globally. Recent items in nav.
**Module:** search (cross-module helper)
**Depends on:** P1-16, P1-13

**Scope:**
- Component: `<CommandPalette>` using shadcn `<Command>` primitive
- Triggered by Cmd-K / Ctrl-K globally
- tRPC: `search.global` — combines results from parties, invoices, projects, expenses, contracts via Postgres FTS
- Result rows show entity type, name, secondary detail (e.g., "Invoice INV-2026-0042 — Apex Systems — \$12,450")
- Recent items: track last 10 viewed entities per user, store in `user_pinned_actions` with `action_key='recent'` (or a dedicated `recent_views` table — decide in implementation)
- Top of nav shows "Recent" expandable list
- Pin to favorites: Cmd-D on any entity adds it to `user_pinned_actions`

**Out of scope:**
- Saved searches (Phase 2)
- Typesense / Meilisearch (Phase 5)
- Search-while-typing on every page (only command palette)

**Acceptance:**
- [ ] Cmd-K opens palette from any page
- [ ] Search returns relevant results in < 200ms
- [ ] Recent items appear in nav
- [ ] Pin-to-favorites works
- [ ] Mobile: palette accessible via topbar search icon

---

### P1-23: First AI feature — expense categorization
**Goal:** When the owner creates an expense without an account_id, AI suggests one. The owner accepts or rejects with one click.
**Module:** ai, finance
**Depends on:** P1-20, P1-07

**Scope:**
- Subscriber: `src/modules/ai/events/subscribers/categorizeExpense.ts`
- Listens for `finance.expense.created` where `chart_of_accounts_id` is null (or where confidence-low flag is set)
- Calls `ai.run('expense-categorizer', { description, amount, payee })` with a prompt that includes the org's CoA
- Writes `ai_suggestions` row with kind='categorize_expense', payload `{proposedAccountId, confidence, reasoning}`
- Confidence threshold: only show in UI if confidence >= 0.6
- `<AiSuggestionPanel>` shows the suggestion on the expense detail page
- Accept action calls `applyAccountSuggestion` which updates the expense's `chart_of_accounts_id` and marks the suggestion accepted
- Reject action marks the suggestion rejected, no change to expense
- Prompt template in `src/modules/ai/lib/prompts/categorizeExpense.ts`
- Vitest: subscriber logic with mocked AI provider, accept-suggestion flow

**Out of scope:**
- Auto-accept rules (Phase 5)
- Other AI features (Phase 5)
- Multi-suggestion ranking (single best suggestion only in Phase 1)

**Acceptance:**
- [ ] Expense created without account triggers AI suggestion within 10 seconds
- [ ] Suggestion appears in `<AiSuggestionPanel>` on expense detail page
- [ ] Accept applies the categorization and writes to audit log
- [ ] Reject marks rejected and the suggestion disappears
- [ ] Cost recorded in `ai_runs`, attributed to `finance` module budget

---

### P1-24: PWA shell + service worker
**Goal:** CXAllies installs as a PWA on mobile. Works offline for expense entry (queues for sync) and time tracking.
**Module:** infrastructure
**Depends on:** P1-05

**Scope:**
- Add `next-pwa` or equivalent (use Workbox under the hood)
- `manifest.json` with CXAllies branding, icons (placeholder until P1-25)
- Service worker caches app shell + API responses where safe
- Offline queue for expense entry: when offline, save to IndexedDB; sync on reconnect
- Offline indicator in topbar
- Lighthouse PWA audit passes

**Out of scope:**
- Full offline mode for everything (Phase 5)
- Background sync via push (Phase 5)
- Native wrapper via Capacitor (Phase 5)

**Acceptance:**
- [ ] Lighthouse PWA score > 90
- [ ] App installs on iOS Safari and Android Chrome
- [ ] Offline expense entry works end-to-end
- [ ] Reconnection syncs queued mutations

---

## Section 7 — Settings, polish, deploy (week 6)

### P1-25: Brand system application
**Goal:** Apply the Varahi Group / CXAllies brand palette and typography across the app. Ship the brand-portfolio asset that was deferred from kickoff.
**Module:** ui foundation
**Depends on:** P1-05, all UI tickets

**Scope:**
- Define brand palette CSS variables in `globals.css`:
  - `--brand-primary` (Varahi anchor color)
  - `--brand-secondary` (CXAllies sub-brand color)
  - `--brand-tertiary` (lighter version of secondary)
- Define typography scale: `--font-sans`, `--font-display`, type scale variables
- Update shadcn theme to consume these variables
- Apply across all components — sidebar, buttons, charts, PDFs
- Per-business-line accent: optional secondary color override (Pravara.ai might have its own accent)
- `data-brand` attribute on `<html>` switches the active palette
- Add Varahi Group + CXAllies logos to `public/`
- Update PWA manifest with real icons

**Out of scope:**
- Marketing site (separate workstream)
- Multi-brand dashboard switcher (Phase 5)
- Email template branding (covered in P1-14, refresh here)

**Acceptance:**
- [ ] All UI consumes brand variables, no hardcoded colors
- [ ] Typography is consistent
- [ ] Logos render in shell, login page, PDF letterheads
- [ ] Five-minute test: a stranger looking at the app says "this looks polished"

**Note:** Brand colors and typography to be provided before this ticket starts. If not provided, ticket implementer uses placeholder palette and flags for owner approval.

---

### P1-26: Production deploy + observability
**Goal:** CXAllies is live at `app.cxallies.com`. Logs flow to Sentry. Daily DB backups verified.
**Module:** infrastructure
**Depends on:** all prior tickets

**Scope:**
- Vercel project setup, link to GitHub repo, env vars configured
- Railway Postgres provisioned, connection pooling set up (transaction mode)
- Railway worker service for pg-boss
- Cloudflare R2 production buckets, IAM tokens
- Postmark production domain verification, SPF/DKIM/DMARC configured
- Google Cloud OAuth client switched to production credentials
- Sentry project for app + worker, source maps uploaded
- Domain pointed at Vercel: `app.cxallies.com`
- TLS verified
- Daily Postgres backup verified (Railway native + a manual restore test)
- Status page placeholder (BetterStack free tier)
- Runbook in `docs/runbooks/deploy.md`
- README updated with operations section

**Out of scope:**
- Multi-region (Phase 5)
- Read replicas (Phase 4 if needed)
- Custom monitoring dashboards (Phase 4)

**Acceptance:**
- [ ] Production URL serves the app
- [ ] Owner logs in to production successfully
- [ ] A test expense created in prod, verified via DB
- [ ] Sentry receives a test error
- [ ] Backup restore test succeeds
- [ ] DNS, TLS, email DKIM all green

---

## Section 8 — Sign-off (week 6, end)

### P1-27: Phase 1 sign-off
**Goal:** Confirm Phase 1 goal is met: Owner has stopped using QuickBooks. Document what's next.
**Module:** —
**Depends on:** P1-26

**Scope:**
- Owner records 30 minutes of real usage in production: expense, revenue, invoice generation, dashboard review
- Bug list compiled from real usage
- Top 5 bugs fixed in a quick patch ticket (P1-28 if needed)
- `docs/00-vision.md` updated with "Phase 1 retrospective" section
- `docs/phase-2-tickets.md` drafted (skeleton, not full)
- `CLAUDE.md` refreshed with anything learned in Phase 1
- Source docs (vision, playbook) regenerated with CXAllies name finalized

**Out of scope:**
- Phase 2 work (separate workstream)

**Acceptance:**
- [ ] Owner confirms: "I have not opened QuickBooks in 7 days"
- [ ] Sign-off document signed (owner statement in repo)
- [ ] Phase 2 backlog has at least 5 tickets drafted
- [ ] All planning docs reflect what was actually built

---

## Phase 1 ticket summary

| # | ID | Goal | Module | Week |
|---|---|---|---|---|
| 1 | P1-01 | Repo scaffold | infra | 1 |
| 2 | P1-02 | DB setup + shared primitives | db | 1 |
| 3 | P1-03 | Foundation schemas (auth/parties/files) | parties | 1 |
| 4 | P1-04 | Authentication | auth | 1 |
| 5 | P1-05 | App shell + nav | ui | 1 |
| 6 | P1-06 | Finance schemas + CoA | finance | 2 |
| 7 | P1-07 | Expense entry CRUD | finance | 2 |
| 8 | P1-08 | Revenue + journal entries | finance | 2 |
| 9 | P1-09 | Expense reports + reimbursement | finance | 2 |
| 10 | P1-10 | Tax estimates | finance | 2 |
| 11 | P1-11 | Billing schemas + projects + contracts | billing+crm | 3 |
| 12 | P1-12 | Time entries + timesheets | billing | 3 |
| 13 | P1-13 | Invoice generation | billing | 3 |
| 14 | P1-14 | Invoice PDF + email | billing+files | 3 |
| 15 | P1-15 | R2 + Drive picker | files | 3 |
| 16 | P1-16 | Parties full CRUD | parties | 4 |
| 17 | P1-17 | Project Health tile | reporting | 4 |
| 18 | P1-18 | Executive dashboard | reporting | 4 |
| 19 | P1-19 | Subscriptions UI | billing | 5 |
| 20 | P1-20 | AI substrate | ai | 5 |
| 21 | P1-21 | Synthetic data seeding | db | 5 |
| 22 | P1-22 | Global search | ui | 5 |
| 23 | P1-23 | AI feature: expense categorization | ai+finance | 5 |
| 24 | P1-24 | PWA shell | infra | 5 |
| 25 | P1-25 | Brand system application | ui | 6 |
| 26 | P1-26 | Production deploy + observability | infra | 6 |
| 27 | P1-27 | Phase 1 sign-off | — | 6 |

**Total: 27 tickets across 6 weeks.**

---

## What's missing? What's wrong? What do we do next?

Three flags to wrap up planning:

1. **Ticket sizing.** I sized for ~half-day to full-day per ticket. With 27 tickets across 6 weeks (30 days), that's ~1 ticket per day at full-time pace. At your stated 15–25 hrs/week pace, you'll average ~3 tickets/week, finishing in ~9 weeks. Decide if that's acceptable or if scope should shrink. Cut candidates if needed: P1-22 (search), P1-24 (PWA).

2. **The brand system in P1-25** depends on you delivering the Varahi/CXAllies palette + typography. If that brand work hasn't happened by week 5, P1-25 ships placeholders and the brand swap becomes a Phase 2 ticket. Flag for you to start the brand workstream in parallel.

3. **No support module work in Phase 1.** All inbound communication (vendor emails, client emails) still happens in your existing Gmail. The system doesn't ingest email until Phase 2 (P2-XX, ADR-0005). Confirm this is acceptable for the 6-week period.

Reply with corrections or "go" and I produce the final artifact: refreshed source docs (`00-vision.md`, `CLAUDE.md`, `.cursorrules`, `AI_Build_Playbook.md`) reflecting everything we decided. That closes planning. After that, you move to Claude Code in VS Code and start P1-01.
