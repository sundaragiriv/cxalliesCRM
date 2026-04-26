# CXAllies — AI Build Playbook

> The discipline framework for building CXAllies with Claude Code in VS Code. Updated from the original playbook to reflect what we learned in planning.

## Part 1 — The Mental Model

You are not a "user typing prompts." You are the **Engineering Manager + Product Owner + Tech Lead** for an AI developer.

Your AI is a brilliant junior-to-mid engineer with:
- ✓ Excellent code generation in any language
- ✓ Knowledge of every framework
- ✓ Patience for boilerplate and refactoring
- ✗ No memory of yesterday's work
- ✗ No knowledge of YOUR business unless you tell it
- ✗ A tendency to over-engineer or hallucinate APIs
- ✗ Will happily build the wrong thing confidently

Your job is to compensate for the bottom three with discipline.

## Part 2 — Skills you've already exercised in planning

You've completed:
- ✓ System design (architecture, modules, boundaries)
- ✓ Database modeling (60+ tables with cross-module FKs)
- ✓ Spec writing (4 ADRs, 27 tickets, conventions doc)
- ✓ Prompt engineering (CLAUDE.md)

You'll exercise during build:
- TypeScript fluency (debugging type errors AI introduces)
- Next.js / React 19 mental model (Server vs Client Components)
- Drizzle ORM patterns
- Code review discipline
- Git branching discipline

## Part 3 — Your Tooling Stack

| Tool | Purpose | Cost |
|---|---|---|
| **Claude Code** (in VS Code) | Daily driver — code generation, refactors, agentic tasks | API tokens or Claude Max subscription |
| **VS Code** | IDE | Free |
| **GitHub** | Repo + project board | Free |
| **TablePlus or DBeaver** | DB inspection | $89 / Free |
| **Vercel + Railway** | Hosting | $25–40/mo |
| **Sentry** | Error monitoring | Free tier |
| **Claude Desktop** | Architecture review, ADRs, debugging help | Subscription |

**Tooling discipline:** Claude Code is your code-writing tool. Claude Desktop (this conversation) is your architecture and planning partner. Don't blur the two — Desktop doesn't know your repo state, Claude Code shouldn't be writing ADRs.

## Part 4 — The Repository Structure

Already documented in CLAUDE.md and `docs/01-architecture.md`. The `docs/` folder + `CLAUDE.md` are 80% of the magic. Claude Code reads these every session.

## Part 5 — Prompt Templates

### Template A — Project System Prompt
Already shipped: `CLAUDE.md`.

### Template B — Module Build Prompt

For each Phase 1 ticket, the prompt to Claude Code is:

```
## Task: P1-XX — [ticket goal]

### Context
Read these first:
- CLAUDE.md
- docs/02-data-model.md (sections relevant to [module])
- docs/phase-1-tickets.md (ticket P1-XX)
- src/modules/[reference-module]/ (use as pattern)

### Scope (per ticket P1-XX)
[paste ticket scope from phase-1-tickets.md]

### Deliverables
[paste ticket deliverables]

### Out of scope
[paste ticket out-of-scope list]

### Acceptance criteria
[paste ticket acceptance checklist]

### Open questions for me before you start
List any clarifying questions. Do not start coding until I answer.
```

### Template C — Bug Fix Prompt

```
## Bug: [one-line summary]

### Reproduction
1. Steps...
2. Expected: ...
3. Actual: ...

### Hypothesis (verify, don't trust me)
I think the issue is in `src/modules/X/Y.ts:42`.

### Constraints
- Do not change [unrelated thing]
- Add a regression test that fails before your fix and passes after
- Smallest possible diff
```

### Template D — Refactor Prompt

```
## Refactor: [target]

### Why
[The pain point]

### Approach
[Proposed approach in 2–3 sentences]

### Constraints
- Behavior must be IDENTICAL (tests prove this)
- Migrate in 3 atomic commits: extract → switch callers → delete old
- No new dependencies
```

## Part 6 — Workflow Discipline

### The Daily Loop

```
Morning planning (15 min) →
  Pick 1 ticket from phase-1-tickets.md →
    Spec it as a prompt using Template B →
      Hand to Claude Code in VS Code →
        Review the diff carefully →
          Run tests + manual smoke test →
            Commit with conventional commit msg →
              Push →
                Move to next or stop
End of day (15 min) →
  Update docs with anything learned →
  Plan tomorrow
```

### The Golden Rules

1. **Never let AI work on more than ~500 lines of new code per turn.**
2. **Always read every line of generated code before merging.**
3. **Commit after every successful AI turn.** If the next turn breaks, `git reset`.
4. **Keep `main` always working.** Feature branches are cheap.
5. **Write the test first** when logic is non-trivial.
6. **When AI loops or hallucinates 3 times, stop and rewrite the prompt.**
7. **Document decisions in ADRs.** Future-you and future-AI both need them.

### When to use Claude Desktop vs Claude Code

| Need | Tool |
|---|---|
| Write code, edit files, run terminal commands | **Claude Code in VS Code** |
| Review architecture, write an ADR, refine a spec | **Claude Desktop** |
| Debug an error you've been pasting at Claude Code unsuccessfully | **Claude Desktop** (with the error context) |
| Plan a new ticket | **Claude Desktop** |
| Implement a planned ticket | **Claude Code** |

Don't ask Claude Desktop to write production code — it doesn't have your repo. Don't ask Claude Code to write architecture docs — it'll over-fit to the immediate code in front of it.

## Part 7 — Cost & Time Estimates

For Phase 1 (27 tickets, 6 weeks):

| Resource | Estimate |
|---|---|
| **Your time** | 15–25 hours/week × 6 weeks (~120–150 hrs at full pace; 9 weeks at 15 hrs/week) |
| **Claude subscription** | $20–200/month depending on plan + API usage |
| **Infrastructure** | $25–40/month (Vercel + Railway + Postmark + R2) |
| **One-time** | $200 (domain, brand assets) |
| **Total Phase 1** | **~$400–800** |

For comparison, outsourced Phase 1 build:
- Mid-market dev shop: $50–100K
- Solo contractor: $30–50K
- Offshore: $15–25K

## Part 8 — Anti-Patterns (Do NOT)

| Anti-pattern | Instead |
|---|---|
| "Build me an ERP" one-shot prompts | Decompose to ticket → vertical slice |
| Letting AI design the schema | YOU designed it; AI implements |
| Skipping tests for speed | Tests for business logic, period |
| No CLAUDE.md | Already done |
| Long chats without commits | Commit every successful turn |
| Asking AI for opinions on business logic | YOU own business logic |
| Ignoring TypeScript errors | Zero-error policy on `main` |
| Adding deps without ADR | ADR or refuse |
| Cross-module internal imports | ESLint blocks, code review enforces |
| Asking Claude Desktop to write production code | Use Claude Code |
| Asking Claude Code to write architecture | Use Claude Desktop |

## Part 9 — When to Bring in a Human

Hire a contractor (10–20 hours) when:
- Security-sensitive area (payments, PII handling, OAuth tokens)
- Performance regression you can't diagnose in 2 hours
- Architecture review before decisions ossify
- Stuck on a bug for >4 hours

A senior eng review at month 2 and month 5 is worth $2–3K. Budget for it.

## Part 10 — Day-1 Checklist

- [ ] Repo created and pushed to GitHub
- [ ] All `docs/` files committed (the 9 planning artifacts)
- [ ] `CLAUDE.md` at repo root
- [ ] Claude Code installed in VS Code (or Claude Code CLI working)
- [ ] Claude subscription / API key active
- [ ] Local Postgres via Docker working
- [ ] First ticket P1-01 spec'd and ready to hand to Claude Code

## Part 11 — TL;DR

The 10 things that decide success:
1. Treat AI as a junior dev; you are the architect
2. `docs/` and `CLAUDE.md` are already set up — keep them current
3. YOU designed the schema; AI implements it
4. One ticket at a time, vertical slices
5. Commit after every successful AI turn
6. Test business logic. Always.
7. Claude Code in VS Code for code; Claude Desktop for architecture
8. Use Template B for every ticket
9. Read every line before merging
10. Update CLAUDE.md weekly with what you learn

Now go to `docs/phase-1-tickets.md` and start with P1-01.
