# CXAllies — Phase 1 progress + catch-up

**Read this first** when picking up the codebase mid-stream. It's the
authoritative status doc — updated after every shipped ticket. Pairs with
`docs/phase-1-tickets.md` (the spec) and `docs/03-conventions.md` (the rules).

Last updated: **2026-04-28** after P1-13 (`8a33b33`).

---

## 1. Where we are

**Branch:** `main` · **Latest commit:** `8a33b33` · **Working tree:** clean

**Phase 1 status:** 13 of 27 tickets shipped. **Up next: P1-14** (invoice PDF + Postmark email).

| Ticket | Status | Commit | Brief |
|---|---|---|---|
| P1-01 → P1-07 | ✅ | (pre-history) | repo scaffold, DB, schemas, auth, app shell, expenses |
| P1-08 | ✅ | `5b0f2ec` | revenue + journal substrate + tx-threading refactor |
| P1-09 | ✅ | `aa984d2` | expense reports + accrual reimbursement journal |
| P1-10 | ✅ | `d10e4a0` | quarterly tax estimates + auto-recompute + mark-paid |
| P1-11 | ✅ | `2530f3b` | billing + crm schemas + cross-module FKs + deal-stage templates |
| P1-12 | ✅ | `0fbe1ac` | time entries + weekly timesheet workflow |
| P1-13 | ✅ | `8a33b33` | invoicing + project CRUD + payment posting |
| P1-14 | ⏳ next | — | invoice PDF + Postmark email |
| P1-15 → P1-27 | ⏳ | — | see `phase-1-tickets.md` |

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

### `defineAction` unified Server Action wrapper (P1-08)
`src/lib/actions/define-action.ts` — opens a tx, runs permission +
zod parse + handler + audit_log insert in one pass. Every mutation in the
codebase goes through it. The handler receives `ctx.tx` for atomic
side-effects (mutation + journal post + activity emit + audit row all
commit together or roll back together).

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
