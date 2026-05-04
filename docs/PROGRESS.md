# CXAllies — Phase 1 progress + catch-up

**Read this first** when picking up the codebase mid-stream. It's the
authoritative status doc — updated after every shipped ticket. Pairs with
`docs/phase-1-tickets.md` (the spec) and `docs/03-conventions.md` (the rules).

Last updated: **2026-05-03** after P1-15a (org-scoped email config + ADR-0007).

---

## 1. Where we are

**Branch:** `main` · **Latest commit:** `8a33b33` · **Working tree:** clean

**Phase 1 status:** 14 of 27 mainline tickets shipped, plus P1-15a (slot-in
correction). **Up next: P1-15** (R2 setup + Drive picker).

| Ticket | Status | Commit | Brief |
|---|---|---|---|
| P1-01 → P1-07 | ✅ | (pre-history) | repo scaffold, DB, schemas, auth, app shell, expenses |
| P1-08 | ✅ | `5b0f2ec` | revenue + journal substrate + tx-threading refactor |
| P1-09 | ✅ | `aa984d2` | expense reports + accrual reimbursement journal |
| P1-10 | ✅ | `d10e4a0` | quarterly tax estimates + auto-recompute + mark-paid |
| P1-11 | ✅ | `2530f3b` | billing + crm schemas + cross-module FKs + deal-stage templates |
| P1-12 | ✅ | `0fbe1ac` | time entries + weekly timesheet workflow |
| P1-13 | ✅ | `8a33b33` | invoicing + project CRUD + payment posting |
| P1-14 | ✅ | `075dcd8` + `0637064` | invoice PDF (@react-pdf/renderer) + Postmark email + ADR-0006 |
| P1-15a | ✅ | (this branch) | org-scoped email config + ADR-0007; env vars become bootstrap-only |
| P1-15 | ⏳ next | — | R2 production + Drive picker |
| P1-16 → P1-27 | ⏳ | — | see `phase-1-tickets.md` |

---

## 2. Spec deviations — read before assuming the spec is canonical

The original `phase-1-tickets.md` spec was patched during execution where
decisions diverged from it. The patched spec is current; this section
records *why* in plain English so future sessions don't get whiplash.

### P1-09 (expense reports)
- **Two-journal accrual model** chosen (approval recognizes liability;
  reimbursement settles cash) over single-entry-at-payment. Tax-payable
  CoA accounts (2200/2210/2220) reserved for Phase 2 accrual mode but
  unused in Phase 1.
- **Removed `submitted → draft` recall** from the state machine — Phase 2
  multi-user race window. Use reject + reopen instead.
- **Added `rejected → soft-delete`** so rejected reports don't linger
  forever.
- Added **`employee_payable`** SYSTEM_ROLE.

### P1-10 (tax estimates)
- **Single-entry tax payment journal** (DEBIT Owner Draws, CREDIT Cash).
  LLC pass-through model — tax payments are owner equity reductions.
  Per-tax-kind tracking via line-level descriptions, not separate accounts.
- **Standard deduction skipped in Phase 1** — estimates run conservatively
  high (the safe direction). Full deduction model + `tax_constants` table
  lands in P4-XX.
- **Auto-recompute is synchronous, in-tx** (not pg-boss). pg-boss swap-in
  in Phase 5 — same call site, body change only.
- Added **`owner_draws`** SYSTEM_ROLE.

### P1-11 (billing + crm schemas)
- **Narrowed to schemas-only** (no UI for projects/contracts in P1-11).
  Spec's project/contract UI moved to P1-13 where projects gain immediate
  utility for invoicing. Rationale: a "create project" form before time
  entries / invoices would fail the 5-minute test.

### P1-12 (timesheets)
- **One time entry per (project, day, user)** — partial unique index
  WHERE `deleted_at IS NULL`. Soft-deleted rows can repeat; active rows
  can't.
- **Auto-create timesheet on first entry** (no "Start week" CTA).
- Project picker for new entries: status IN (planned, active, on_hold).
- **Block submit when no rate** on project AND no per-entry override.
- **Phase 1 single-user**: same user submits + approves their own
  timesheet. P2-XX adds separation-of-duties (~10 LOC).
- Codified **§3.13 (value-at-time-of-event snapshot pattern)** in
  conventions — billable rate snapshots from project at time-entry
  creation; project rate edits don't rewrite history.

### P1-14 (invoice PDF + email)
- **Dropped `react-pdf` (PDF.js viewer), added `@react-pdf/renderer`** — the
  original `CLAUDE.md` tech-stack table conflated the two packages. The
  viewer was never the right tool for our use case; native browser PDF
  viewing via `<a target="_blank">` to a signed R2 URL is what we ship.
  See **ADR-0006** for the full reasoning.
- **No in-app PDF viewer.** `FilePreview` for PDFs renders an "Open PDF"
  link to a new tab; `InvoiceDetail` "Download PDF" does the same. Browser
  natively renders. The expense receipt preview was migrated off the
  embedded viewer in this ticket.
- **Versioned R2 keys for generated PDFs**:
  `{org}/billing/invoices/{invoice_id}/v{N}/invoice-{number}.pdf`. Each
  send / resend produces a NEW `files` row at a new versioned key; older
  versions are preserved (R2 storage is effectively free at our scale,
  audit trail value is high). `invoices.pdf_version` int column tracks
  the current version; `pdf_file_id` points at the latest.
- **`sendInvoice` is idempotent across resends.** First send (status='draft')
  posts the journal, sets `sent_at`, flips status. Resend (status in
  ['sent','partially_paid','paid']) regenerates the PDF + re-emails but
  does NOT re-post the journal and does NOT bump `sent_at`. Status='void'
  refuses (re-issue via `createInvoice` / `generateInvoiceFromProject`).
- **Postmark via fetch (no SDK).** Typed wrapper with structured error
  classification: `transient` (retriable), `recipient` (hard bounce / inactive,
  do not retry same address), `config` (sender signature unconfirmed —
  ops fix), `invalid_request` (malformed). Magic dev token
  `POSTMARK_API_TEST` returns synthetic 200s for tests.
- **External side effects fire AFTER tx commit.** `defineAction` extended
  with an optional `postCommit` thunk on the handler return. The thunk
  runs after the transaction commits and its result merges (shallow spread)
  into `data`. PDF + R2 + journal commit atomically; email sends post-commit
  and reports its success/failure via `emailSent` / `emailMessageId` /
  `emailError` fields. Email failure does NOT roll back the committed
  send — the user retries via the **Resend** button.
- **~7-day signed URLs in invoice emails.** Discovered during verify
  that AWS SigV4 caps presigned URL expiry at 604,800 seconds (7 days)
  exactly — the original 30-day plan was physically impossible. MinIO
  enforces the same cap. The PDF is also attached, so an expired link
  degrades to "open the attachment" rather than failing. Phase 2 replaces
  this with an auth-checked route handler (`/api/invoices/:id/pdf`) that
  signs fresh URLs on access — no TTL ceiling. See §7.
- **Brand → accent hex map is in code** (`_invoice-pdf-payload.ts`).
  P1-25 migrates this to an `accent_hex` column on `brands`.
- **`Mark as sent` button renamed to `Send invoice`.**

### P1-15a (organization-scoped email configuration)
- **ADR-0007 codifies the env-vs-DB line.** Tenant identity (sender
  domain, address, name, message stream) lives in DB rows. Env vars are
  reserved for deployment-environment config (secrets, connection
  strings, deployment topology). Env vars MAY bootstrap seed scripts;
  once seeded, the application reads from DB, never from env at
  runtime. The line is principled — tenant-facing → row, deployment
  credential → env. This is now the binding pattern for all future
  tenant-facing config (locale, branding, billing identity, etc.).
- **Correction to P1-14, not an additive feature.** P1-14 wired
  `POSTMARK_FROM_ADDRESS` / `POSTMARK_FROM_NAME` /
  `POSTMARK_MESSAGE_STREAM` as runtime env reads. P1-15a moves them to
  the `organizations` row; the env vars remain as **optional**
  bootstrap-only inputs to the seed script.
- **Migration 0020 is schema-only.** Adds four columns to
  `organizations`: `email_sender_domain`, `email_sender_address`,
  `email_sender_name` (all nullable), and
  `postmark_message_stream text NOT NULL DEFAULT 'outbound'`. The
  bootstrap-from-env happens in `db/seed/01-organizations.ts`, not in
  the migration body — SQL can't read env, and the seed already runs
  per-install.
- **Resolver: `lib/email/from-org.ts` `getEmailIdentity(tx, orgId)`.**
  Mirrors the shape of `findRevenueAccountForBusinessLine` (P1-13) and
  `findSystemAccount` (P1-08). Throws `MissingOrgEmailConfigError`
  with `fieldErrors` for the form. `sendInvoice` calls this **inside**
  the tx, BEFORE the journal post, so a misconfigured org fails fast.
- **`sendEmail` signature changed** to require an `identity` payload
  (resolved via `getEmailIdentity` by the caller). New optional
  `fromOverride` parameter is the **Phase 2 seam for per-brand sender** —
  accepted today but not branched on. When `brands` gains
  `email_sender_address`, the brand-first / org-fallback resolver lands
  behind this seam without changing `sendInvoice`.
- **Production-token guard.** `lib/env.ts` schema-level `superRefine`
  forbids `POSTMARK_API_TEST` when `NODE_ENV=production`. Catches the
  realistic misconfig where the sandbox token leaks into a prod env file.
- **Seed is idempotent.** First install populates the four columns from
  env (or placeholders if env unset). Re-running seed against an
  existing org only backfills NULL columns — never overwrites values
  the owner has edited via Settings UI.
- **Settings UI.** `/settings/organization/email` (Server Component
  shell + Client form, react-hook-form + zod resolver). Owner role
  only via `parties.admin` permission. Edits go through
  `defineAction` + `withAudit`, so changes write an `audit_log` row.
- **Verify script's load-bearing assertion is fetch interception.**
  `verify-p1-15a` stubs `globalThis.fetch`, calls `sendEmail` with an
  identity resolved via `getEmailIdentity`, and asserts the captured
  request body's `From` header matches the org row — not the env var.
  Mutating the row produces a different `From` on the next send (proves
  DB-driven, not cached). A code-wiring assertion (grep on the action
  source) confirms `getEmailIdentity` is called BEFORE
  `postInvoiceJournal` in the source ordering, complementing the
  runtime null-column check that produces zero journal entries.
- **Module ownership note.** `organizations` lives in `parties/schema.ts`
  (the parties module owns the table — it's the spine the rest of the
  data model FKs into). The original ticket framing said "auth"; the
  P1-15a entry corrected this. tRPC namespace follows: `parties.organization.getEmailConfig`.

### P1-13 (invoicing)
- **Org-wide invoice numbering** `INV-YYYY-NNNN` (per §3.12) — NOT the
  spec's earlier per-BL `{BL_SLUG}-INV-`. Per-BL parallel sequences
  confuse customer conversation; `business_line_id` on the invoice gives
  filtering for free.
- **Void blocks if payments exist** with a clear remediation message.
  Refund / credit-memo flow is Phase 2+.
- **Partial payments supported** in Phase 1; multi-invoice-per-payment
  via `payment_applications` defers to Phase 2.
- **Updates after `sent` are void + new**, not reverse-and-repost. Cleaner
  for multi-line invoices; matches QuickBooks/FreshBooks expectation.
- **Overdue is a derived UI badge**, never written to the column. Saves a
  daily job in P1-13; the state machine stays pure.
- **No PDF in P1-13** — `pdf_file_id` stays NULL, button labeled "Mark as
  sent". P1-14 ships the PDF + Postmark wiring.
- **Project CRUD landed here** (deferred from P1-11 per the design call).
- **§3.13 headline test passes** — editing a source `time_entry`'s
  description after invoice generation does NOT rewrite the invoice line.

---

## 3. Conventions codified mid-stream

These didn't exist when Phase 1 started. They're now binding for all
future tickets.

| § | Title | Added | What it covers |
|---|---|---|---|
| 3.11 | Customer data vs reference data | (existed) | Tenant data → editable rows. Reference data → system-shipped tables, no `organization_id`. Enums only when code branches on the value. |
| 3.12 | Sequential numbering | P1-09 | `{PREFIX}-YYYY-NNNN` 4-digit org-wide. JE/EXP/INV/PAY/PR/PRJ. `MAX+1` race window OK in Phase 1; counters table or retry-on-unique-violation in Phase 2. |
| 3.13 | Value-at-time-of-event snapshot | P1-12 | Snapshot any field that drives billing/accounting/tax math at the moment of the transaction. Subsequent edits to source-of-truth must NOT rewrite the transaction. |

---

## 4. Architectural patterns established

### `defineAction` unified Server Action wrapper (P1-08, extended P1-14)
`src/lib/actions/define-action.ts` — opens a tx, runs permission +
zod parse + handler + audit_log insert in one pass. Every mutation in the
codebase goes through it. The handler receives `ctx.tx` for atomic
side-effects (mutation + journal post + activity emit + audit row all
commit together or roll back together).

**P1-14 addition: `postCommit` thunk.** Handlers can return an optional
`postCommit: () => Promise<Partial<TResult>>` alongside `result`. The
thunk fires AFTER the tx commits — used for external side effects (email,
webhooks, third-party APIs) that must not roll back if the DB writes
succeeded. Thunk's return is shallow-merged into `data`. Thunk failure
does NOT roll back the committed tx; the thunk reports its own success
/ failure via merged-in fields. First user is `sendInvoice` (Postmark
email); pattern is reusable for any action that combines accounting state
+ external delivery.

### Journal substrate (P1-08+)
`src/modules/finance/lib/journal/`:
- `next-entry-number.ts` — `JE-YYYY-NNNN` sequence
- `post-revenue.ts` — 2-line entry (P1-08)
- `post-expense-report-approval.ts` — N+1 lines (P1-09)
- `post-expense-report-reimbursement.ts` — 2 lines (P1-09)
- `post-tax-payment.ts` — 4 lines (P1-10)
- `post-invoice.ts` — 1+N lines (P1-13)
- `post-payment.ts` — 2 lines (P1-13)
- `reverse-entry.ts` — generic reversal of any source entry
- `find-unreversed.ts` — query helper for state transitions that need to
  reverse prior journal entries (rejection from approved, void invoice, etc.)

### State machine pattern
Per §3.11 — transition graph as data, not switch statements. Each entity
with a workflow has `lib/{entity}s/state-machine.ts` exporting:
- `STATUSES` const array
- `nextAllowedStates(status)` returning readonly tuple
- `assertTransition(from, to)` throwing on invalid
- `canEditContent(status)` / `canSoftDelete(status)` — pure functions
- A typed error class (`InvalidXxxTransitionError`)

UI components consume the same `nextAllowedStates` to show/hide buttons.

Implemented for: expense reports (P1-09), timesheets (P1-12), invoices
(P1-13).

### SYSTEM_ROLES on `chart_of_accounts`
Tagged via the `system_role` column. Resolution at journal-post via
`findSystemAccount(tx, orgId, role)` returning the account id. Throws
`MissingSystemAccountError` if not tagged.

Roles defined so far:
- `cash_operating` — account 1000
- `ar_default` — account 1100
- `employee_payable` — account 2300 (P1-09)
- `owner_draws` — account 3200 (P1-10)

P1-13 added a parallel `findRevenueAccountForBusinessLine` resolver for
revenue accounts that resolve via BL rather than role.

### Template + materialize pattern (CoA + deal stages)
For tenant-customizable workflows where Phase 1 ships sensible defaults:
- System-managed reference table (`*_templates`) — no `organization_id`
- Template lines (`*_template_lines`)
- Materializer helper (`apply{Thing}Template(orgId, ...)`) — idempotent,
  inserts missing per-org rows
- Tenants edit freely after materialization

Used for: Chart of Accounts (P1-06), deal stages (P1-11). Future targets
in §3.11.

### Org-scoped configuration resolver (P1-15a, codified in ADR-0007)
The pattern for tenant-facing configuration that varies per organization:

1. **Schema column** on `organizations` (or `brands` / `business_lines`
   for finer-grained scope) — never an enum, never an env var.
2. **Resolver** in `lib/{topic}/from-org.ts` exporting
   `get{Topic}(tx, orgId)` and a `Missing{Topic}Error` class with
   `fieldErrors`. Throws when required columns are NULL.
3. **In-tx lookup** at the top of any action that depends on the
   resolved value — fail fast before any side-effects (journal,
   external API call, etc.) commit.
4. **Bootstrap from env** in the seed script at first install only;
   re-runs only backfill NULL columns, never overwriting owner edits.
5. **Settings UI** at `/settings/{topic}` — Server Component shell +
   Client form via react-hook-form + zod, mutation through
   `defineAction` + `withAudit`.
6. **`*Override` seam** on the consumer wrapper (e.g. `sendEmail.fromOverride`)
   reserves the future per-brand / per-record refinement without
   churning call sites when it lands.

First user: `getEmailIdentity` (P1-15a) for outbound email sender.
Future targets: per-org tax preferences (P4 deduction model), brand
accent color (P1-25), org-default time zone for reports (P4).

### Snapshot pattern (§3.13)
`time_entries.billable_rate_cents` snapshots from project rate at create
time. `invoice_lines.description`/`unit_price_cents` snapshot from time
entries / expenses at invoice generation. Editing the source row after
the snapshot does NOT rewrite the transaction.

### Sync recompute (with pg-boss swap-in path)
Tax estimate recompute called inside the same tx as the originating
mutation (revenue/expense/expense-report transitions, invoice payment).
~5–15ms per call. Phase 5 swaps to a pg-boss enqueue at the same call site.

### Verification scripts (one per ticket starting P1-09)
`apps/web/scripts/verify-p1-XX.ts` — runs end-to-end against the real DB
in a single transaction, asserting the high-stakes invariants (journal
balance, state transitions, snapshot integrity, etc.) and cleans up
after itself. Re-runnable. Run after `db:migrate` + `db:seed` per ticket.

---

## 5. Migrations chain

The drizzle journal has bitten me 3 times — see
[`docs/runbooks/migrations.md`](runbooks/migrations.md) for the
monotonic-`when` trap and the snapshot-id-collision trap. **Always** run
the jq monotonicity check after `pnpm db:generate` until we move to the
counters approach in Phase 2.

| # | Tag | Adds |
|---|---|---|
| 0000–0008 | scaffold + auth | (P1-01 → P1-04) |
| 0009 | finance_tables | finance schema (P1-06) |
| 0010 | finance_intra_module_fks | self-references (P1-06) |
| 0011 | finance_updated_at_triggers | (P1-06) |
| 0012 | coa_system_role | `system_role` column + partial unique index (P1-08) |
| 0013 | employee_payable_account | tag account 2300 (P1-09) |
| 0014 | owner_draws_account | tag account 3200 (P1-10) |
| 0015 | billing_crm_tables | drizzle-generated (P1-11) |
| 0016 | finance_billing_crm_cross_module_fks | hand-written (P1-11) |
| 0017 | time_entries_unique_per_day | partial unique on (org, project, user, date) (P1-12) |
| 0018 | invoice_line_revenue_account | adds `chart_of_accounts_id` to invoice lines (P1-13) |
| 0019 | invoice_pdf_version | adds `pdf_version` int default 0 (P1-14) — per-send version tracker for invoice PDFs |
| 0020 | organization_email_config | adds `email_sender_domain`, `email_sender_address`, `email_sender_name` (nullable) and `postmark_message_stream` (NOT NULL DEFAULT 'outbound') to `organizations` (P1-15a) — runtime From identity moves from env to row per ADR-0007 |

---

## 6. Reading the codebase fast

If you have 5 minutes:
- `docs/02-data-model.md` — schema source of truth
- `docs/03-conventions.md` — the rules, especially §3.11–§3.13
- `apps/web/src/modules/finance/actions/expense-reports.ts` — best example
  of the full `defineAction` + state-machine + journal-post pattern
- `apps/web/src/modules/billing/lib/invoices/state-machine.ts` — state
  machine pattern in its cleanest form
- `apps/web/src/modules/finance/lib/journal/post-invoice.ts` — multi-line
  journal helper at the most complex case

If you have 30 minutes:
- Pick a verification script (`apps/web/scripts/verify-p1-13.ts` is the
  most comprehensive) and read it end-to-end. It walks the entire
  ticket's flow against the real DB and shows what every helper does.

If you're starting a new ticket:
- Read the spec entry in `docs/phase-1-tickets.md`
- Read the §3.11–§3.13 conventions even if you've read them before
- Skim *this* doc's "Spec deviations" section
- Read the most-recently-shipped ticket's verification script — it shows
  what "good" looks like at this point in the codebase

---

## 7. Open follow-ups (Phase 2+)

Tracked here so they don't get lost in commit messages. Not actionable
until their target phase, but useful context.

### Phase 2 (post-Phase-1)
- **Multi-user separation of duties** on timesheets/expense reports
  (~10 LOC each — `submitter !== approver` check, dedicated permission)
- **Recall** workflow for submitted timesheets/reports (currently use
  reject + reopen)
- **Refund / credit-memo** flow on invoices (currently void blocks if
  paid)
- **Multi-invoice payment** via `payment_applications` (Phase 2 wires UI;
  schema and journal already support it)
- **Counters table** for `next*Number` helpers (eliminates the race
  window) OR retry-on-unique-violation
- **Accrual mode toggle** for tax estimates — uses the per-kind
  tax-payable accounts that already exist in CoA but are unused in
  Phase 1
- **Per-line back-reference for expense → invoice line** (currently
  table-level via `expense_entries.invoice_id`)
- **Auth-checked invoice PDF route** to replace ~7-day signed URLs in
  outbound emails. P1-14 wanted 30-day TTLs but AWS SigV4 caps presigned
  URLs at 7 days (hard SDK enforcement, MinIO same). Phase 2 introduces
  `/api/invoices/:id/pdf` that checks auth and signs a fresh URL on each
  access — no TTL ceiling. Until then: PDF stays attached to the email,
  link "stays live for one week" per the email body copy.
- **Postmark sender domain verification** (DKIM/SPF/DMARC). P1-14
  shipped against the sandbox token; P1-15a moved the sender identity
  fields onto the `organizations` row (per ADR-0007). The verified
  domain string lives at `organizations.email_sender_domain`. Phase 2
  adds the verification UI + status webhook handler; today the column
  is informational and DKIM verification happens in the Postmark
  dashboard. Production deploy at P1-26 still needs the chosen sender
  domain (`invoices@cxallies.com` or `billing@varahigroup.com`) DNS-
  configured (DKIM CNAME + Return-Path CNAME + DMARC TXT). DNS records
  take 24-48h to propagate; start them well before P1-26.
- **Per-brand sender.** When CXAllies and Pravara.ai need different
  From addresses, `brands` gains its own `email_sender_address` /
  `email_sender_name` columns and the resolver in
  `lib/email/from-org.ts` becomes brand-first / org-fallback. The
  `fromOverride` parameter on `sendEmail` (P1-15a) is the seam — call
  sites don't change.

### Phase 4
- **Standard deduction + QBI + retirement + HSA** for tax calculator —
  via a new `tax_constants` reference table
- **Tax line items on invoices** — `tax_cents` and
  `tax_rate_basis_points` already in schema, unused
- **Schedule C export**

### Phase 5
- **pg-boss async recompute** — swap call sites where Phase 1 calls
  recompute synchronously
- **Time tracker timer** (start/stop)
- **Project status as data** if a tenant proves the need (Phase 1 keeps
  it as enum since universal across SMBs)
- **Mobile time entry** (Phase 1 grid is desktop-first)
- **Custom invoice templates per business_line**
- **Brand `accent_hex` column on `brands`** — P1-14 hardcodes the
  brand-slug → hex map in `_invoice-pdf-payload.ts`. P1-25 migrates this
  to a column. Bumping the column also requires regenerating sent
  invoice PDFs (or NOT — old PDFs preserve the original brand color
  by design, since each version is a snapshot at render time).

### Documentation debt
- `docs/02-data-model.md §6` had a 3-digit-padded `EXP-2026-001` example;
  fixed to 4-digit in P1-09.
- The data-model author flagged
  `expense_reports.reimbursement_payment_id`'s FK target as suspect
  modeling. Phase 1 keeps the column nullable; redesign deferred.
- The data-model author flagged
  `payments.revenue_entry_id`'s FK target similarly. Same disposition —
  column nullable, redesign deferred.

---

## 8. Maintenance protocol

**On every shipped ticket**, update this file:
1. Bump the "Last updated" line at the top.
2. Update the table in §1 (commit hash, brief).
3. Add a §2 entry if anything diverged from the spec.
4. Add new conventions to §3 if any §3.X was added.
5. Add new patterns to §4 if any infra-level pattern emerged.
6. Add migration to §5 with a one-line description of what it adds.
7. Move follow-ups out of §7 as they ship; add new ones as they emerge.
8. Commit alongside the ticket's commit (or as a follow-up commit if
   forgotten).
