# Phase 1 — Ticket Specs

> Detailed, codebase-aware specs for the remaining Phase 1 tickets (P1-15
> → P1-27). Each file is a Template B prompt (per
> [`AI_Build_Playbook.md`](../AI_Build_Playbook.md) Part 5) refined
> against the **current** state of the repo at the time of writing.

These supplement, not replace,
[`phase-1-tickets.md`](../phase-1-tickets.md). The original ticket file
is the historical plan; the spec files here are the actual prompts to
hand to Claude Code, with:

- **Updated scope** reflecting what already shipped (per
  [`PROGRESS.md`](../PROGRESS.md)) — many tickets are narrower than
  their original phase-1-tickets.md entry because foundation work has
  shifted earlier in the chain.
- **Reference module pointers** — the cleanest pattern in the codebase
  to mirror (e.g. "follow `apps/web/src/modules/finance/actions/expense-reports.ts`
  as the canonical state-machine + journal pattern").
- **Architectural anchors** — `defineAction`, `withAudit`, `postCommit`,
  `findSystemAccount`, `getEmailIdentity`, the state-machine pattern,
  the snapshot rule (§3.13), the org-scoped config pattern (ADR-0007).
- **Open questions** that Claude Code must answer before coding.
- **Verify script** requirements per the discipline established in
  P1-09+.

---

## Spec status

| Ticket | Spec | Brief |
|---|---|---|
| [P1-15](./P1-15.md) | drafted | R2 production buckets + Google Drive OAuth + picker integration |
| [P1-16](./P1-16.md) | drafted | Parties full CRUD with Customer-360 activity tab |
| [P1-17](./P1-17.md) | drafted | Project Health calculator + tile |
| [P1-18](./P1-18.md) | drafted | Executive dashboard v1 |
| [P1-19](./P1-19.md) | drafted | Subscription plans + subscriptions UI + renewal jobs |
| [P1-20](./P1-20.md) | ⛔ deferred | AI module substrate — DEFERRED to Phase 2+ per [ADR-0008](../adr/0008-ai-opt-in-not-core.md) |
| [P1-21](./P1-21.md) | drafted | Synthetic 12-month seed for dashboard validation |
| [P1-22](./P1-22.md) | drafted | Cmd-K global search + recents + favourites |
| [P1-23](./P1-23.md) | ⛔ deferred | First AI feature (expense categorization) — DEFERRED per [ADR-0008](../adr/0008-ai-opt-in-not-core.md); replaced by P1-23-alt |
| [P1-23-alt](./P1-23-alt.md) | drafted | **Memorized transactions** (rule-based vendor→account suggestion; replaces P1-23) |
| [P1-24](./P1-24.md) | drafted | PWA shell + offline expense queue |
| [P1-25](./P1-25.md) | drafted | Varahi / CXAllies brand system application |
| [P1-26](./P1-26.md) | drafted | Production deploy + observability (Vercel/Railway/Sentry) |
| [P1-27](./P1-27.md) | drafted | Phase 1 retrospective + sign-off |

---

## How to use a spec

1. Open the spec file for the ticket you're picking up.
2. Read it end-to-end before opening Claude Code.
3. Answer any **Open questions for me** items in the spec — those gate
   the start of work.
4. In VS Code with Claude Code, paste the **Prompt** block at the top of
   the spec as the Template B instruction. The rest of the file is
   reference material Claude Code reads from the repo.
5. After the ticket merges, update
   [`PROGRESS.md`](../PROGRESS.md) per its §8 maintenance protocol —
   spec deviations go in §2 there, NOT here.

---

## Spec file format

Every spec follows this header:

```
# P1-XX — [ticket goal]

**Module:** [primary] · [secondary if any]
**Depends on:** [list of P1-XX tickets that must merge first]
**Estimated size:** [S | M | L] · ~[N] hours
**Up-to-date as of:** [commit hash of PROGRESS.md when written]
```

Followed by these sections (Template B + the discipline additions):

- **Context — read these first**
- **What changed since `phase-1-tickets.md`** (delta section — the
  current state of the repo vs. the original plan)
- **Scope**
- **Out of scope**
- **Implementation order**
- **Reference modules / files**
- **Deliverables**
- **Acceptance**
- **Verify script must**
- **Open questions for me before you start**
- **Notes for implementer**

---

## Cross-cutting rules every spec inherits

These don't get re-stated in each spec; assume they apply:

- §3.11 — customer data vs reference data vs enums (the canonical
  template+materialize pattern for tenant-customizable defaults)
- §3.12 — 4-digit zero-padded sequential numbering
  (`{PREFIX}-YYYY-NNNN`)
- §3.13 — value-at-time-of-event snapshot pattern
- §2.1 — module shape is fixed (`api/`, `actions/`, `events/`,
  `types.ts`, `components/`, `lib/`, `schema.ts`)
- §4.1 — tRPC for reads, Server Actions for writes; every action goes
  through `defineAction` (which composes `withAudit` and opens the tx)
- §4.5 — `ActionResult<T>` shape with `fieldErrors` on validation
  failure
- §5 — react-hook-form + zod resolver for every form
- §6.3 — Server Components by default
- §15 — definition of done (tsc clean, lint clean, tests pass, mobile
  responsive at 375px, five-minute test)

When a spec references one of these, it cites the section number, not
the rule body.

---

## Migration numbers in specs are placeholders

Multiple specs reference specific migration numbers (P1-15 uses `0021`,
P1-16 uses `0021`, P1-20 uses `0022`, P1-21 uses `0021` + `0022`, P1-22
uses `0023` + `0024`). These were assigned at spec-write time assuming
each ticket lands next.

**They will collide.** The drizzle journal requires monotonic
`when`-timestamps and unique numeric prefixes. The actual migration
number is assigned at implementation time based on the chain at that
moment.

The implementer's job:

1. `pnpm db:generate --name describe_change` and let drizzle-kit pick
   the next available number.
2. Update the migration number references in PROGRESS.md §5 to match.
3. Re-run the jq monotonicity check from `docs/runbooks/migrations.md`
   after generating — the journal trap has bitten this codebase three
   times.

The migration's **content** is what's load-bearing in the spec; the
**number** is not. Treat any `00XX_*` literal in a spec as `<next>` at
implementation time.

---

## Cross-cutting patterns to use (codified mid-stream)

| Pattern | First user | Re-use guidance |
|---|---|---|
| `defineAction` + `withAudit` + tx | every mutation since P1-08 | mandatory for all new Server Actions |
| `postCommit` thunk on `defineAction` | `sendInvoice` (P1-14) | use for any external side effect (email, webhook, third-party API call) that must fire AFTER the tx commits and must NOT roll back DB writes if it fails |
| State machine as data (not switch) | expense reports (P1-09), timesheets (P1-12), invoices (P1-13) | mandatory for any entity with a status workflow; export `STATUSES`, `nextAllowedStates`, `assertTransition`, `canEditContent`, typed error class |
| `findSystemAccount` / `findRevenueAccountForBusinessLine` | finance journal posts | mirror the shape for any other "resolve a tenant-customizable resource by stable role" pattern |
| Template + materialize | Chart of Accounts (P1-06), deal stages (P1-11) | use for any tenant-customizable workflow that ships sensible defaults; future targets: dashboard tiles, role permission overrides |
| `getEmailIdentity` / org-scoped config resolver (ADR-0007) | outbound email (P1-15a) | mandatory for any tenant-facing configuration; reserve a `*Override` seam for finer-grained scope (per-brand, per-business-line, etc.) |
| Verification script per ticket | P1-09 onward | every spec includes a `scripts/verify-p1-XX.ts` that runs e2e against the real DB and asserts the high-stakes invariants |

A new pattern that emerges from any spec below should land in
[`PROGRESS.md`](../PROGRESS.md) §4 after the ticket merges, not in this
file.
