# CXAllies — Intelligent AI/ERP Solutions

A self-hosted ERP + CRM + AI platform built by Varahi Group LLC.

> First user: Varahi Group itself. Designed for $300K–$5M companies.
> Phase 1 goal: replace QuickBooks in 6 weeks.

## Documentation

All planning and design documentation is in [`docs/`](./docs/). Read in this order:

1. [`docs/00-vision.md`](./docs/00-vision.md) — what this is and why
2. [`docs/01-architecture.md`](./docs/01-architecture.md) — system design, modules, deployment
3. [`docs/02-data-model.md`](./docs/02-data-model.md) — full Postgres schema + Drizzle code
4. [`docs/03-conventions.md`](./docs/03-conventions.md) — coding standards
5. [`docs/04-glossary.md`](./docs/04-glossary.md) — locked vocabulary
6. [`docs/adr/`](./docs/adr/) — architecture decision records
7. [`docs/phase-1-tickets.md`](./docs/phase-1-tickets.md) — 27 atomic Phase 1 tickets
8. [`docs/AI_Build_Playbook.md`](./docs/AI_Build_Playbook.md) — discipline for AI-assisted build

## For Claude Code

[`CLAUDE.md`](./CLAUDE.md) at the repo root is the system prompt Claude Code reads at the start of every session. Keep it current.

## Status

**Phase 1 — Foundation.** Currently planning complete; build starts at ticket P1-01.

## Tech stack (locked)

Next.js 15 + TypeScript strict + Postgres 16 + Drizzle + Tailwind + shadcn/ui + tRPC + Server Actions + Better Auth + Postmark + Cloudflare R2 + Google Drive + pg-boss + Vitest + Playwright + Anthropic + OpenAI + Vercel + Railway.

See [`CLAUDE.md`](./CLAUDE.md) for the full table and rationale links.
