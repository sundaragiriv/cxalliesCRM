# ADR-0003: AI as a First-Class Module from Phase 1

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

The CXAllies vision document positions AI as a differentiator: "AI-native, not AI-bolted-on." The Phase 5 plan in the same document lists AI features (smart categorization, reply drafting, document extraction, anomaly detection, conversational query, meeting notes) as the final delivery phase.

During planning, the owner explicitly upgraded AI from "Phase 5 polish" to "first-class module from day one." The reasoning: every CRUD screen built without an AI hook in Phase 1 is a screen that needs to be re-entered in Phase 5. Retrofitting AI into 50+ existing screens is materially more expensive than reserving the architectural slots upfront.

Two questions need to be answered:

1. **What does "first-class from Phase 1" mean concretely** if Phase 1 doesn't ship AI features?
2. **How do we prevent AI from becoming a god module** that touches every other module's internals?

This ADR answers both.

---

## 2. Decision

**The `ai` module ships as a Phase 1 substrate. Phase 5 ships AI features.**

Concretely, in Phase 1 we ship:

- The `ai` module structure with `api/`, `actions/`, `events/`, `types.ts`, `lib/providers/`, `schema.ts`
- Three tables: `ai_runs`, `ai_suggestions`, `ai_embeddings`
- Provider wrappers for Anthropic and OpenAI (typed, swappable)
- Cost tracking and per-module budget enforcement
- One reference subscriber: `ai/subscribers/categorizeExpense.ts` — listens for `finance.expense.created`, produces an `ai_suggestion`, never mutates the source data
- One UI primitive: `<AiSuggestionPanel entity="..." />` — a reusable component that renders pending suggestions for any entity

Phase 5 ships the rest of the catalog (reply drafting, anomaly detection, conversational query, etc.) on top of this substrate without schema changes.

The architectural rule that prevents AI from becoming a god module: **AI is always a subscriber, never an owner. AI never writes business data directly — only `ai_suggestions` rows that humans accept.**

---

## 3. Rationale

### 3.1 Why first-class, not bolted-on

The vision document's "five differentiators" include "AI-native, not AI-bolted-on." Bolted-on AI looks like:

- A separate "AI" tab in the nav with disconnected features
- Per-module ad-hoc OpenAI calls scattered through the codebase
- No cost tracking, no provider abstraction, no audit trail
- AI features that depend on integration glue written for each module

First-class AI looks like:

- Every module emits events that AI can subscribe to without modifying that module
- Every entity in the system has a consistent way to surface pending AI suggestions
- One place to track cost, latency, and provider usage
- Adding a new AI feature is writing a new subscriber, not modifying N modules

The architectural difference is enormous. Bolted-on AI accrues technical debt every release. First-class AI compounds in capability per release because the substrate is already there.

### 3.2 Why ship the substrate in Phase 1

The cost of shipping `ai_runs`, `ai_suggestions`, `ai_embeddings`, and the provider wrappers in Phase 1 is roughly 2–3 days of work. The cost of retrofitting them in Phase 5 is:

- 50+ existing screens that need an `<AiSuggestionPanel>` slot
- 30+ existing actions that need to emit events the AI module can subscribe to
- A retroactive audit of every direct provider call that crept in during Phases 1–4 because there was no central wrapper
- Likely a major migration to add `ai_suggestion_id` foreign keys after the fact

The substrate is cheap now and expensive later. Standard "design now, build later" pattern.

### 3.3 Why the subscriber pattern

The natural temptation is to put AI calls inline in mutations:

```typescript
// BAD — inline AI call
async function createExpense(input) {
  const expense = await db.insert(expenseEntries).values(input);
  const category = await openai.complete(`Categorize: ${input.description}`);
  await db.update(expenseEntries).set({ accountId: category }).where(...);
  return expense;
}
```

Three problems:

1. **Latency:** every expense creation now waits for an LLM call (1–5 seconds).
2. **Failure coupling:** if OpenAI is down, expense creation fails.
3. **No human review:** the AI's categorization is applied directly, with no approval step.

The subscriber pattern fixes all three:

```typescript
// GOOD — event-driven, async, suggestion-only
async function createExpense(input) {
  const expense = await db.insert(expenseEntries).values(input);
  await emit('finance.expense.created', { expenseId: expense.id });
  return expense;
}

// In ai/subscribers/categorizeExpense.ts (runs in a pg-boss job)
on('finance.expense.created', async ({ expenseId }) => {
  const expense = await finance.api.getExpense(expenseId);
  const result = await ai.run('expense-categorizer', { expense });
  await ai.actions.createSuggestion({
    entity: { table: 'finance_expense_entries', id: expenseId },
    kind: 'categorize_expense',
    payload: { proposedAccountId: result.accountId, confidence: result.confidence },
    aiRunId: result.runId,
  });
});

// User sees the suggestion in <AiSuggestionPanel>; clicks Accept; mutation runs.
```

This pattern:

- **Decouples latency** — expense creation returns instantly; AI runs asynchronously.
- **Decouples failure** — if AI fails, the suggestion is missing; the expense is still recorded.
- **Preserves human authority** — the user accepts or rejects each suggestion.
- **Creates an audit trail** — every suggestion links to the AI run that produced it.

### 3.4 Why AI never writes business data

The discipline that AI only writes to `ai_suggestions` (never to `expense_entries`, `tickets`, `invoices`, etc.) is the most important rule in this ADR. Reasons:

1. **Auditability.** Every business-data mutation goes through a normal action, so the audit log captures who did what. If AI mutated business data directly, the audit log would say "AI did it" with no human accountable.
2. **Reversibility.** A bad AI suggestion is a row in `ai_suggestions` marked rejected. A bad direct-mutation is a corrupted business record requiring a manual fix.
3. **Trust calibration.** Users learn how often the AI is right. As trust grows, Phase 5+ can introduce auto-accept rules ("auto-categorize expenses with confidence > 0.95"). Without the suggestion-then-accept pattern, there's no data on accuracy.
4. **Regulatory cleanliness.** Financial systems may eventually face audit. "AI suggested, human approved" is defensible. "AI wrote a journal entry directly" is not.

This rule has one explicit exception in Phase 5+: auto-accept rules created by users with the Owner role can promote AI suggestions to mutations without human review per-suggestion. The user creating the rule is the accountable party. Phase 1 does not implement this.

### 3.5 Why provider-agnostic from day one

Anthropic, OpenAI, Google, and others compete on a near-monthly cadence. Locking to one provider in 2026 is locking to one provider's pricing, latency, and capability profile. A six-month gap between "best for code" and "best for vision" is normal.

The `ai/lib/providers/` directory contains thin wrappers that expose a uniform interface:

```typescript
type AiProvider = {
  complete: (prompt: string, opts: CompleteOpts) => Promise<CompletionResult>;
  embed: (text: string) => Promise<number[]>;
  // ...
};
```

`anthropic.ts`, `openai.ts`, and future `google.ts` implement the interface. The rest of the codebase calls `ai.run('feature-name', input)` which internally selects the right provider for the configured feature.

Cost: ~200 lines of glue code in Phase 1.
Benefit: provider switches are a config change, not a refactor.

### 3.6 Why pgvector instead of a separate vector DB

Phase 1 reserves an `ai_embeddings` table with a `vector(1536)` column powered by Postgres `pgvector`. Reasons:

1. Railway's Postgres supports `pgvector` natively — no new infrastructure.
2. Embeddings are typically small (\<10K rows in Phase 1, \<1M rows even at SaaS scale for our use cases). `pgvector` handles this comfortably.
3. Keeping embeddings in the same database as business data means we can JOIN — "find similar past expenses" is one query, not a fan-out.
4. Adding a separate vector DB (Pinecone, Weaviate, Qdrant) is an extra service to operate, an extra failure mode, and an extra ~\$50–200/mo.

If we ever exceed 10M embeddings or need sub-10ms vector search, we revisit. Until then, `pgvector` is the right answer.

---

## 4. Schema commitments

### 4.1 `ai_runs`

Every LLM call. Append-only.

```typescript
ai_runs
├── id                  uuid PK
├── organization_id     uuid FK
├── feature             text          -- e.g., 'expense-categorizer'
├── provider            text          -- 'anthropic' | 'openai' | ...
├── model               text          -- e.g., 'claude-opus-4-7'
├── prompt              text          -- the prompt sent (for audit)
├── completion          text          -- the response received
├── prompt_tokens       integer
├── completion_tokens   integer
├── cost_cents          bigint
├── latency_ms          integer
├── triggered_by_user_id uuid FK NULL
├── triggered_by_event  text NULL     -- e.g., 'finance.expense.created'
├── status              text          -- 'success' | 'error' | 'rate_limited'
├── error_message       text NULL
├── created_at          timestamptz
└── ...
```

Indexes: `(feature, created_at)`, `(organization_id, created_at)`. Partitioned by `created_at` month if volume warrants in Phase 5.

### 4.2 `ai_suggestions`

Every AI output tied to an entity. Lifecycle: `pending` → `accepted | rejected | expired`.

```typescript
ai_suggestions
├── id                  uuid PK
├── organization_id     uuid FK
├── ai_run_id           uuid FK → ai_runs.id
├── entity_table        text          -- e.g., 'finance_expense_entries'
├── entity_id           uuid
├── kind                text          -- e.g., 'categorize_expense'
├── payload             jsonb         -- {proposedAccountId, confidence, reasoning}
├── confidence          numeric(5,4)  -- 0.0000 to 1.0000
├── status              text          -- 'pending' | 'accepted' | 'rejected' | 'expired'
├── decided_by_user_id  uuid FK NULL
├── decided_at          timestamptz NULL
├── expires_at          timestamptz NULL
├── created_at          timestamptz
└── ...
```

Indexes: `(entity_table, entity_id, status)`, `(organization_id, status, created_at)`.

### 4.3 `ai_embeddings`

Vectors for semantic search. One row per embedded entity.

```typescript
ai_embeddings
├── id                  uuid PK
├── organization_id     uuid FK
├── entity_table        text
├── entity_id           uuid
├── embedding           vector(1536)
├── model               text          -- e.g., 'text-embedding-3-small'
├── source_text         text          -- what was embedded (for debugging)
├── created_at          timestamptz
└── ...
```

HNSW index on `embedding` via `pgvector`. Indexes: `(entity_table, entity_id)`, `(organization_id, model)`.

### 4.4 What's deliberately NOT in Phase 1 schema

- No `ai_workflows` or `ai_rules` tables. Auto-accept rules and workflow chains are Phase 5.
- No `ai_conversations` table. Conversational query is Phase 5.
- No prompt versioning system beyond a `feature` string. If Phase 5 needs prompt experimentation, we add it then.

---

## 5. Module surface

The `ai` module's public API:

```
src/modules/ai/
├── api/
│   ├── getSuggestions.ts        # for any entity, list pending suggestions
│   ├── getCostSummary.ts        # for reporting dashboard
│   └── getRunHistory.ts         # debug/admin view
├── actions/
│   ├── acceptSuggestion.ts      # marks suggestion accepted; emits event for module to act on
│   ├── rejectSuggestion.ts
│   ├── createSuggestion.ts      # internal-ish; called by ai's own subscribers
│   └── runFeature.ts            # invoke an AI feature explicitly (e.g., user clicks "AI: draft reply")
├── events/
│   └── subscribers/             # one file per AI feature
│       ├── categorizeExpense.ts (Phase 1)
│       ├── draftTicketReply.ts  (Phase 5)
│       ├── classifyLead.ts      (Phase 5)
│       └── ...
├── lib/
│   ├── providers/
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   └── types.ts
│   ├── budget.ts                # per-module daily/monthly budget enforcement
│   ├── prompts/                 # prompt templates per feature
│   └── embeddings.ts            # generate, store, query
├── components/
│   ├── AiSuggestionPanel.tsx    # reusable panel for any entity detail page
│   ├── AiCostBadge.tsx          # shows running cost in admin views
│   └── ...
├── schema.ts                    # ai_runs, ai_suggestions, ai_embeddings
└── types.ts
```

Every other module's detail pages import `<AiSuggestionPanel>` and pass the entity table + ID:

```tsx
// In src/app/(authed)/finance/expenses/[id]/page.tsx
<AiSuggestionPanel entityTable="finance_expense_entries" entityId={expenseId} />
```

The panel handles its own data fetching, optimistic updates on accept/reject, and confidence display. Adding AI to a new entity in Phase 5 is one line of JSX.

---

## 6. Cost and budget enforcement

### 6.1 Per-module budgets

Each module has a configured daily and monthly AI budget in cents. Stored in `ai_budgets` (added to `ai` schema).

```typescript
ai_budgets
├── module              text PK   -- 'finance' | 'crm' | ...
├── daily_cap_cents     bigint
├── monthly_cap_cents   bigint
└── ...
```

Phase 1 defaults:
- Per-module daily cap: 200 cents (\$2)
- Per-module monthly cap: 5000 cents (\$50)
- Total system monthly cap: 30000 cents (\$300)

Configurable via Settings UI in Phase 1 (the one AI-related UI we ship before Phase 5).

### 6.2 Enforcement

Before every AI run, `ai/lib/budget.ts` checks:

1. Has this module exceeded its daily cap?
2. Has this module exceeded its monthly cap?
3. Has the system as a whole exceeded its monthly cap?

If any cap is hit, the run is denied with status `rate_limited`. The subscriber logs the denial; no suggestion is created. A dashboard tile surfaces "AI budget remaining" in real time.

### 6.3 Cost visibility

The reporting dashboard (Phase 1) ships a tile: "AI cost this month" with breakdown by module. Owner can drill into `ai_runs` for any run.

---

## 7. Consequences

### 7.1 Positive

- Adding an AI feature in Phase 5+ is one new file in `ai/events/subscribers/`. No changes to other modules.
- Every AI call is logged, costed, and auditable.
- Provider switches are config changes, not refactors.
- Human-in-the-loop is the default. Auto-accept rules in Phase 5 are an explicit opt-in, not the natural state.
- AI cost overruns are impossible — budget enforcement is mandatory.

### 7.2 Negative

- ~3 days of Phase 1 work for a substrate with one user-visible feature (expense categorization). Justified by §3.2.
- Asynchronous suggestions feel less "magic" than inline AI ("Why didn't it categorize my expense immediately?"). Mitigation: UI shows a "AI is thinking..." indicator; suggestions usually appear within 5–10 seconds.
- Per-module budgets are an extra setting to configure. Sensible defaults make this acceptable.

### 7.3 Neutral

- The provider abstraction layer adds ~200 lines of code that would not exist with a single-provider lock-in. Worth it.
- The subscriber pattern requires every module to emit events for things AI might want to react to. This discipline is valuable independent of AI — it's also what enables the activity timeline and the Phase 5 workflow engine.

---

## 8. Alternatives considered

### 8.1 Inline AI calls in mutations (rejected)

Discussed in §3.3. Rejected for latency, failure coupling, and lack of human review.

### 8.2 AI as a separate service (microservice) (rejected)

Inconsistent with ADR-0001. AI is a module, not a service. The provider abstraction in `ai/lib/providers/` is the only place that talks to external APIs.

### 8.3 Defer all AI work to Phase 5 (rejected)

The retrofit cost in §3.2 is the rebuttal.

### 8.4 Ship AI features in Phase 1, not just substrate (rejected)

Tempting. Rejected because Phase 1's primary goal is "replace QuickBooks." Adding AI features stretches Phase 1 from 6 weeks to 10. Better to ship the substrate, prove the pattern works on one feature (expense categorization), and ship the catalog in Phase 5.

### 8.5 Use a separate vector database (Pinecone, Weaviate, Qdrant) (rejected)

Discussed in §3.6. `pgvector` is sufficient until we exceed scale we won't hit in Phases 1–4.

### 8.6 LangChain or similar orchestration framework (rejected)

LangChain abstracts at the wrong level for our use cases. Most of our AI features are single LLM calls with structured output, not multi-step agent chains. A 200-line `ai/lib/providers/` directory is simpler than a LangChain dependency. If Phase 5 needs agentic chains, we revisit.

### 8.7 Single-provider lock-in (Anthropic only or OpenAI only) (rejected)

Locks future capability to one vendor's roadmap. The provider abstraction is cheap insurance.

---

## 9. References

- Vision document `00-vision.md` §6 (AI/Agentic Capabilities)
- Architecture document `01-architecture.md` §6 (AI architecture)
- Glossary `04-glossary.md` Section 11 (AI Suggestion, AI Run definitions)
- pgvector — https://github.com/pgvector/pgvector
- Anthropic API — https://docs.claude.com
- OpenAI API — https://platform.openai.com/docs

---

## 10. What's missing? What's wrong? What do we do next?

Two flags, neither of which blocks moving on:

1. **Default budget caps in §6.1** are conservative (\$2/day per module, \$300/month total). Tunable via Settings UI. If you want different defaults, change them now — otherwise these ship as the defaults and you adjust at runtime.

2. **The reference subscriber I'm shipping in Phase 1 is `categorizeExpense`.** It's the right starter feature because expense entry is high-frequency and categorization is a clear win. If you'd rather start with a different feature (e.g., draft-invoice-from-timesheet), say so — the substrate is the same; only the reference subscriber changes.

Reply or "go" and I produce ADR-0004 (dual-source storage: R2 + Google Drive) next.
