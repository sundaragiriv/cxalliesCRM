# ADR-0008: AI Features Are Opt-In, Not Core

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-05-27 |
| **Decided in** | P1-23-alt scoping conversation (Phase 1, mid-stream) |
| **Related** | ADR-0001 (modular monolith — `ai` is one of the 12 modules), CLAUDE.md Phase 1 scope, conventions §3.11 |

---

## 1. Context

The original Phase 1 plan included two AI tickets:

- **P1-20** — AI module substrate (schema for `ai_runs` / `ai_suggestions` / `ai_features`, provider abstraction for Anthropic / OpenAI, budget enforcement, `<AiSuggestionPanel>` component).
- **P1-23** — First AI feature: expense categorization. When the owner creates an expense without picking a Chart of Accounts entry, the AI suggests one based on the description + vendor.

Both made the original spec set in `docs/specs/`. Both have refined Template-B specs (~470 + ~370 lines). Both were ready to implement.

During the P1-16 / P1-19 / P1-20 sequencing conversation, the owner pushed back on the implicit assumption that AI is part of the core product:

> *"i don't think we should wire AI automatically and start spending on it,
> this would become a subscription approach.. meaning the customer must
> opt-in for AI consumption or we should build a RAG around once they
> start using application.. for a CRM to do regular rhythmic operations
> sounds heavy."*

The push-back is correct. CXAllies is a self-hosted ERP+CRM replacing QuickBooks / HubSpot / Zendesk / Mailchimp for **$300K–$5M companies doing rhythmic operations** (invoicing, expense entry, time tracking, contract management). The original CLAUDE.md design center is *"Simplicity, ease of use, eye-catchy UI, ease of doing things. When in doubt, simplify."*

LLM-based expense categorization specifically:

- Solves a problem (vendor → account mapping) that has a much cheaper deterministic solution (look at the user's history with that vendor).
- Adds an external dependency, latency, hallucination risk, and per-call cost to a path that fires every time anyone enters an expense.
- Changes the operator's cost structure from fixed (server + DB) to per-tenant-usage. For a $300K–$5M SMB doing hundreds of expenses a month, the LLM cost compounds.

The right framing: **AI is a capability, not a feature.** Customers who want it should opt in and bring their own keys (or pay for it as an add-on later). Phase 1 ships a CRM that works fully without any LLM call.

---

## 2. Decision

**AI features are deferred from Phase 1.** The `ai` module exists in the architecture (CLAUDE.md §12 modules) and may land in a future phase, but:

1. **P1-20 (AI substrate) is deferred to Phase 2+.** No `ai_runs` / `ai_suggestions` / `ai_features` tables in Phase 1. No provider abstraction. No budget enforcement code.
2. **P1-23 (AI expense categorization) is deferred to Phase 2+.** Replaced in Phase 1 by **P1-23-alt: Memorized transactions** — a rule-based vendor→account suggester that learns from the user's own expense history. Zero LLM calls, zero per-call cost.
3. **No `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in `lib/env.ts` in Phase 1.** Adding them implies the product needs them; it does not.
4. **When AI lands in Phase 2+, it is opt-in by design**:
   - A per-organization toggle (`organizations.ai_enabled BOOLEAN DEFAULT FALSE`) gates whether any AI feature can fire.
   - Customers bring their own provider keys (stored encrypted at rest per a future ADR — same shape as the OAuth-token encryption referenced in ADR-0004 §3.4).
   - Or AI becomes a paid add-on with operator-supplied keys and metered billing — the economics are decided when there's real tenant demand to inform them.
5. **RAG over tenant data is the preferred shape if AI lands at all.** `pgvector` is already in the stack (CLAUDE.md §1 tech-stack table). Local embeddings + tenant-scoped vector search produce more relevant results than calling an external model with no tenant context, and they cost ~$0 per query after one-shot embedding generation. This shape is decided per-feature when each AI feature is proposed; this ADR doesn't bind it.

---

## 3. Consequences

### 3.1 Positive

- **Operator cost stays fixed.** Server + DB + R2 — no per-tenant-action LLM bill.
- **Customer onboarding has no AI provisioning step.** A fresh tenant works fully without any key setup.
- **Phase 1 ships faster.** ~12–15 hours of P1-20 + P1-23 work compresses to ~3 hours of P1-23-alt.
- **No prompt-injection surface in Phase 1.** Outbound LLM calls expose every input field that lands in a prompt; deferring AI defers that entire security review.
- **No vendor lock-in.** Anthropic vs OpenAI vs local-model decisions are deferred to when there's real evidence of which workload they'd serve.
- **Aligns with the design center.** "Replace QuickBooks" → QuickBooks doesn't use LLMs; it uses memorized transactions. We ship the same pattern.

### 3.2 Negative

- **No AI-powered demo in Phase 1.** A SaaS pitch deck that wants to lead with "we have AI" can't, today. Mitigated by the fact that the Phase 1 customer is the owner himself (Varahi Group), not a SaaS prospect; demo storytelling is a Phase 5+ concern.
- **The substrate work that *was* in P1-20 has to be re-evaluated when AI lands.** Some of it (schema, provider abstraction) was load-bearing; some (budget enforcement, suggestion panel) may not survive contact with the actual first-feature decision. Mitigated by the fact that P1-20's spec is preserved in `docs/specs/P1-20.md` for re-use, with a "deferred" annotation.
- **If demand for AI emerges quickly in Phase 2, we'll wish we had the substrate.** Acceptable trade-off — the substrate is ~3 days of focused work and the demand will tell us *which* substrate to build (RAG, agentic, structured-output-only, etc.) better than the original P1-20 spec did.

### 3.3 Neutral

- **`ai` module stays in the 12-module architecture.** It's empty in Phase 1; that's fine — `support`, `marketing`, `payroll` are also empty in Phase 1 by design.
- **The "Phase 5 swap to pg-boss async" note in PROGRESS.md §4 stands.** When AI lands, the same swap applies — internal effects in tx, LLM call in a post-commit thunk or worker.

---

## 4. Alternatives considered

### 4.1 Ship P1-20 + P1-23 as planned (rejected)

The original spec. Operator pays per call; categorization is the first feature.

Rejected because:

- **Operator cost structure is broken.** Hundreds of expenses/month/tenant × LLM cost = the operator subsidizes every tenant's bookkeeping. At $300K–$5M tenant scale, the unit economics don't work without charging the tenant for AI.
- **The problem doesn't need AI.** Rule-based vendor→account suggestion solves 80%+ of categorization decisions for free. The remaining 20% (genuinely novel vendors, ambiguous descriptions) is exactly the case where the user should just pick the account themselves — they know the answer better than any LLM looking at a 30-character description.
- **Adds external failure modes.** LLM provider outages, rate limits, prompt-injection surface, response-shape drift across model versions. Rule-based has none of these.

### 4.2 Ship P1-20 substrate, defer P1-23 feature (rejected as the chosen path)

Land the schema + provider abstraction + budget enforcement now; defer features. Argument: future AI work has a head-start.

Rejected because:

- **Substrate without features is dead weight.** Schemas to migrate, code to maintain, tests to run, audit-log noise — all for no value until a feature ships.
- **The substrate design will change once a real feature exists.** P1-20 speced a generic `runFeature(featureName, input, opts)` interface — but the right shape for RAG features differs materially from the right shape for structured-output features differs from agentic. Locking the interface in P1-20 without a real consumer is a guess.
- **YAGNI applies.** When AI lands, the first feature's spec drives the substrate's shape; not the other way around.

### 4.3 Ship P1-23 with rule-based fallback when AI is disabled (rejected)

A "smart" mode that uses AI when enabled and falls back to rules when not. Argument: best of both worlds.

Rejected because:

- **Two code paths to maintain, two test suites, two failure modes.** The rule-based path is the simple path; adding an AI path complicates it without changing the default behavior.
- **Premature.** If/when AI ships, the rule-based path stays exactly as it is and the AI feature can layer on top as a "confidence boost" or a "second opinion" — but that decision is informed by real tenant feedback, not by guessing at the design upfront.

---

## 5. Implementation reference

**Phase 1**: `docs/specs/P1-23-alt.md` — Memorized transactions.

Shape:

```typescript
// modules/finance/lib/suggest-account-for-vendor.ts
export async function suggestAccountForVendor(
  tx: FinanceTx,
  organizationId: string,
  vendorPartyId: string,
): Promise<{
  chartOfAccountsId: string
  accountName: string
  useCount: number
  lastUsedAt: string
} | null>
```

- Pure query against `expense_entries` joined to `chart_of_accounts`.
- `GROUP BY chart_of_accounts_id ORDER BY count DESC, MAX(entry_date) DESC LIMIT 1`.
- Returns `null` for first-time vendors (no history to learn from).
- The ExpenseForm calls this when the vendor field changes; pre-fills the account dropdown if no value is set; never blocks manual override.

No new table in Phase 1 — the history already lives in `expense_entries`. A dedicated `expense_vendor_defaults` table (with explicit `use_count` / `last_used_at` columns updated on every save) is a Phase 2+ optimization if the GROUP BY query proves slow at scale.

**Phase 2+ (when AI lands)**:

1. **An opt-in column** on `organizations.ai_enabled BOOLEAN NOT NULL DEFAULT FALSE`.
2. **Provider key storage** — per-org, encrypted at rest. ADR (TBD) covers the encryption scheme; ADR-0004 §3.4's OAuth-token reference is the model.
3. **The first feature's spec drives substrate shape.** If it's RAG over invoices, the substrate is pgvector + embedding pipeline. If it's structured output for expense categorization, the substrate is the provider abstraction layer. Don't pre-build both.
4. **Budget enforcement** lands when there's a real billing model (operator-pays vs tenant-pays vs add-on). Phase 1 has no billing model; deferring this is consistent.

---

## 6. Review trigger

Reopen this ADR if any of the following occurs:

1. **Tenant demand emerges in Phase 2 for a specific AI feature** — that feature's spec triggers a substrate decision (which provider, which interface shape, RAG-or-not). This ADR's "deferred" stance ends when the first real consumer asks.
2. **A competitor's AI feature creates obvious sales pressure** — if losing deals to "QuickBooks has AI now" becomes a real signal, the cost/benefit math changes. Re-evaluate.
3. **Local-model economics shift dramatically** — if a 4GB open-weights model can do structured categorization at acceptable quality on commodity Railway containers, the per-call-cost objection in §1 disappears. RAG on pgvector + a local model is a plausible v2 substrate that this ADR explicitly doesn't preclude.
4. **The rule-based suggestion (P1-23-alt) proves materially insufficient in practice** — if owners consistently override the suggestion or skip categorization entirely because the rule misses too often, the AI fallback case strengthens. The audit data (how often suggestions are accepted vs overridden) is the input to that decision.

Until one of those fires, Phase 1 ships AI-free. This ADR is the authoritative answer to *"should this Phase 1 feature use AI?"* — the answer is no.
