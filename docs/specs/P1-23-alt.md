# P1-23-alt — Memorized transactions (vendor → account suggestion, rule-based)

**Module:** finance (primary — owns the suggestion logic + UI wiring)
**Depends on:** P1-07 (expense entry CRUD shipped), P1-16 (parties full CRUD — vendor party picker)
**Estimated size:** S · ~2–3 hours (one atomic commit)
**Up-to-date as of:** `c52f85b` (post-P1-15a) · supersedes P1-23 per [ADR-0008](../adr/0008-ai-opt-in-not-core.md)

---

## Context — read these first

- **[ADR-0008](../adr/0008-ai-opt-in-not-core.md)** — the binding doc for this ticket. AI is deferred from Phase 1; this spec is the rule-based replacement for what P1-23 originally would have done.
- **[`PROGRESS.md`](../PROGRESS.md) §1 (current ticket status), §4 (`defineAction` pattern), §13 (definition of done).** The full `defineAction` + tRPC contract is the rule for every other action; suggestion *queries* don't go through defineAction (no audit row for a read), but the *accept* action does.
- **`apps/web/src/modules/finance/lib/revenue-accounts.ts`** — the cleanest reference for a "resolve a tenant-customizable resource by stable role" helper. Mirror the shape: small file, one exported function, throws a typed error on resolution failure (or returns `null` when "no match yet" is a legitimate outcome, as it is here).
- **`apps/web/src/modules/finance/schema.ts`** — `expense_entries` table. The fields we care about: `payee_party_id`, `chart_of_accounts_id`, `entry_date`, `organization_id`, `deleted_at` (for the `active` filter).
- **`apps/web/src/modules/finance/components/ExpenseForm.tsx`** — the consumer. Wire the suggestion query in when the vendor field changes.
- **`apps/web/src/modules/finance/api/`** — tRPC routers for finance reads. The suggestion query lands here.

---

## What changed since `phase-1-tickets.md`

The original P1-23 spec was an AI-driven categorizer (LLM call on every expense without an account). ADR-0008 deferred it. This spec replaces it with the QuickBooks "memorized transactions" pattern:

- When the user picks a vendor on the expense form, look up *that vendor's history* in `expense_entries`.
- Suggest the account they've used most often for that vendor, breaking ties by recency.
- Pre-fill the account dropdown if the user hasn't picked one yet. Never block manual override.
- Empty history → no suggestion, no pre-fill, no error.

Same UX value as the AI version for 80%+ of real-world expense entry, at $0 per call and zero external dependency.

---

## Scope

- **`apps/web/src/modules/finance/lib/suggest-account-for-vendor.ts` (new)** — pure query helper:
  ```typescript
  export async function suggestAccountForVendor(
    tx: FinanceTx | DrizzleClient,
    organizationId: string,
    vendorPartyId: string,
  ): Promise<{
    chartOfAccountsId: string
    accountNumber: string
    accountName: string
    useCount: number
    lastUsedAt: string
  } | null>
  ```
  - SELECT `chart_of_accounts_id`, COUNT(*) AS use_count, MAX(entry_date) AS last_used_at
  - FROM `expense_entries` JOIN `chart_of_accounts` ON `chart_of_accounts.id = chart_of_accounts_id`
  - WHERE `expense_entries.organization_id = ?` AND `payee_party_id = ?` AND `chart_of_accounts_id IS NOT NULL` AND `expense_entries.deleted_at IS NULL`
  - GROUP BY `chart_of_accounts_id, account_number, account_name`
  - ORDER BY use_count DESC, last_used_at DESC
  - LIMIT 1
  - Returns `null` when the vendor has no prior expenses (legitimate "no signal" outcome).
- **tRPC `finance.expenses.suggestAccountForVendor`** — wraps the helper. Input: `{ vendorPartyId: string }`. Output: the helper's return shape OR `null`. Permission: `finance.read`. No mutation, no audit row.
- **`ExpenseForm.tsx` integration**:
  - When the vendor (`payeePartyId`) field changes AND the account field is currently empty, call the suggestion query (debounced or via react-query's natural deduplication).
  - On success: `form.setValue('chartOfAccountsId', suggestion.chartOfAccountsId, { shouldDirty: false })` so the form doesn't mark itself dirty from a pre-fill.
  - Show a small hint below the account field: *"Suggested from your last use with this vendor — {N} prior expenses"*. Use the existing `text-xs text-muted-foreground` styling pattern from elsewhere in the form.
  - User typing in the account field manually overrides the suggestion; never block.
- **Unit test** for `suggestAccountForVendor`:
  - Insert 3 expenses with vendor X → account A (account number 6100)
  - Insert 1 expense with vendor X → account B (account number 6200)
  - Call helper → expect account A (most frequent)
  - Insert 5 more expenses with vendor X → account B
  - Call helper → expect account B (now most frequent AND most recent)
  - Insert 1 expense with vendor Y → account C
  - Call helper for vendor Z (no history) → expect `null`
- **`scripts/verify-p1-23-alt.ts`** — see verification section below.

---

## Out of scope

- **Per-user defaults.** Phase 1 is single-user (the owner); cross-user "memorize" patterns are Phase 2+ when separation-of-duties matters.
- **Cross-vendor patterns** ("anything from a gas station → 6500 Auto Expense"). Requires a category-classifier; deferred until there's evidence the per-vendor rule is insufficient.
- **Confidence scoring.** Phase 2+ if the simple frequency-rank proves insufficient. The current rule is honest: "you've done this before; we're not guessing."
- **A dedicated `expense_vendor_defaults` table** with explicit `use_count` / `last_used_at` columns updated on every save. The GROUP BY query against `expense_entries` is the right shape for Phase 1 — adds no schema, no migration, no maintenance. If the query proves slow at scale (~10k+ expenses per tenant), the explicit table is a one-day Phase 2 ADR.
- **AI fallback** for first-time vendors. ADR-0008 explicitly leaves this open for Phase 2+ reopening; not in this ticket.
- **Invoice line application.** The same pattern applies to billable invoice lines (P1-13's `generateInvoiceFromProject`) but the value is lower (invoice lines are usually project-scoped, not vendor-scoped). Defer until there's real demand.

---

## Implementation order

One atomic commit. The whole change is small enough that splitting adds overhead without value.

---

## Reference modules / files

| Pattern | File | Why |
|---|---|---|
| Resolver shape | `modules/finance/lib/revenue-accounts.ts` | Same shape: one exported function, throws/returns-null on no match. Read first. |
| tRPC query pattern | `modules/billing/api/invoices.ts:pdfUrl` | Read procedure that returns a small object or throws NOT_FOUND. |
| react-hook-form integration | `modules/finance/components/ExpenseForm.tsx` | The consumer. Look at existing field-change handlers for the wire-up shape. |
| Unit test pattern | `tests/unit/post-revenue-journal.test.ts` | Test a pure helper with seeded fixtures. |
| Verify script pattern | `apps/web/scripts/verify-p1-15a.ts` | Latest reference; this one is much smaller in scope. |

---

## Deliverables

1. `apps/web/src/modules/finance/lib/suggest-account-for-vendor.ts` (new)
2. `apps/web/src/modules/finance/api/expenses.ts` — `suggestAccountForVendor` procedure added to the existing expenses router
3. `apps/web/src/modules/finance/components/ExpenseForm.tsx` — vendor-change handler + hint label
4. `apps/web/tests/unit/suggest-account-for-vendor.test.ts` (new) — the 7 assertions in §Scope
5. `apps/web/scripts/verify-p1-23-alt.ts` (new) — end-to-end against the real DB
6. PROGRESS.md updated — §1 (P1-23-alt row), §4 (memorized-transactions pattern joins the codified-mid-stream list)

No migration. No new env vars. No new dependencies.

---

## Acceptance

- [ ] `tsc --noEmit` clean
- [ ] `pnpm lint` clean (zero new warnings)
- [ ] `pnpm test` — 89 → 92+ (3+ new tests from the suggester)
- [ ] Verify script `verify-p1-23-alt.ts` passes end-to-end
- [ ] Creating a new expense for a vendor with prior history pre-fills the account dropdown
- [ ] Manual override of the account field always wins; pre-fill never blocks
- [ ] First-time vendor → no pre-fill, no error
- [ ] Five-minute test: owner enters 3 expenses for "Verizon Wireless" via the UI; on the 4th, the Telecom account is pre-filled
- [ ] PROGRESS.md updated §1 + §4

---

## Verify script must

`apps/web/scripts/verify-p1-23-alt.ts`:

1. Locate the seeded Varahi org, the consulting BL, a revenue account (just to have a non-expense CoA to use as a contrast), and an expense account.
2. Locate (or insert) a vendor party.
3. Seed historical expenses:
   - 3 expenses with the vendor + account A
   - 1 expense with the vendor + account B
4. Call `suggestAccountForVendor(db, orgId, vendorId)`.
5. Assert it returns account A (most frequent), `useCount === 3`, `lastUsedAt` matches the most recent of the 3.
6. Seed 5 more expenses with the vendor + account B.
7. Call the suggester again.
8. Assert it returns account B (`useCount === 6`, more recent than A).
9. Insert one expense for a different vendor + account C.
10. Call the suggester for a DIFFERENT vendor (no history). Assert it returns `null`.
11. Cleanup: delete all inserted expense rows + the vendor if newly inserted.

The script is much smaller than verify-p1-15a — no fetch interception, no migration check, no UI assertion. Just the helper's contract.

---

## Open questions for me before you start

1. **Hint copy.** I drafted *"Suggested from your last use with this vendor — {N} prior expenses"*. Confirm or rewrite. (Default: ship what I drafted; refine in the UI polish ticket P1-25 if it grates.)
2. **Pre-fill on vendor *unchange*.** When the user opens an existing-but-empty-account expense and the vendor is already set, should we run the suggestion on mount? Default: yes — same intent ("I just want this filled in"). Confirm.
3. **Soft-delete handling.** Suggestion query excludes `deleted_at IS NOT NULL`. Confirm — or include soft-deleted rows (they're still evidence the user "did this with this vendor"). My read: exclude. Restoring a deleted expense is rare; the cleaner contract is "active history only."
4. **`chart_of_accounts_id IS NULL` rows.** Some legacy expenses may have been entered without an account (the very case this feature solves). The query filters them out — they don't help the suggestion. Confirm — or use them as a "negative signal." My read: filter out; no information.

Default to my recommendations on all four unless you flag otherwise; this is small enough to course-correct after I ship.

---

## Notes for implementer

- **The suggester is a *read*, not a *write*.** It does NOT go through `defineAction`. It does NOT write to `audit_log`. It is a tRPC query, full stop. Resist the urge to route it through the mutation infrastructure.
- **No fancy ranking.** Frequency-DESC then recency-DESC is the contract. If you find yourself reaching for a "confidence score" or a "decay factor," stop — that's Phase 2+ territory. The honesty of *"you did this 3 times with this vendor"* beats any score.
- **Test the no-history case explicitly.** Returning `null` (not an error, not a default account) is the contract — first-time vendors should get a clean empty form, not a wrong guess.
- **Don't auto-fire on every keystroke.** The query fires when `payeePartyId` *changes value* — react-query's `useQuery({ enabled: !!payeePartyId && !accountAlreadySet })` is the right shape. Debounce isn't needed because the input is a select-from-list, not a text field.
- **The codified-mid-stream pattern this introduces** is *"learn from history, suggest from data, never guess."* That's the framing for PROGRESS.md §4 — it's the canonical answer when the AI-feature urge resurfaces in Phase 2+. Same shape applies to "memorized invoice lines" (Phase 2), "memorized timesheet descriptions" (Phase 2), etc.
- **No ADR for this ticket.** ADR-0008 is the binding doc; this spec implements its §5 reference. The codification of the pattern goes in PROGRESS.md §4 alongside the journal substrate and state machine entries.
