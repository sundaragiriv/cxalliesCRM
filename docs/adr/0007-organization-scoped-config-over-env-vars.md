# ADR-0007: Organization-Scoped Configuration over Environment Variables

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-05-03 |
| **Decided in** | P1-15a (Organization-scoped email configuration) |
| **Related** | ADR-0001 (modular monolith), ADR-0004 (storage), conventions §3.11 (customer data vs reference data) |

---

## 1. Context

The CXAllies data model is row-scoped from the ground up. Every business
table carries `organization_id`; the `organizations`, `brands`, and
`business_lines` tables already model tenant identity as editable rows
(see `docs/02-data-model.md` §3.1–§3.3). Conventions §3.11 codifies the
rule: tenant-editable data lives in rows, system-shipped reference data
lives in tables without `organization_id`, and enums are reserved for
values the code branches on.

P1-14 violated this rule. The Postmark integration introduced four
runtime env reads:

- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM_ADDRESS`
- `POSTMARK_FROM_NAME`
- `POSTMARK_MESSAGE_STREAM`

The first is a deployment credential (Postmark authenticates the deploy
to its API). The other three are **tenant identity** — the From header
that recipients of CXAllies invoices see. Tenant identity has no
business living in deployment-environment config.

The owner identified this during P1-14 review as a smell that would
compound when:

1. **Per-brand sender** (Phase 2): CXAllies invoices go from
   `invoices@cxallies.com` while Pravara.ai invoices go from
   `billing@pravara.ai`. Env vars don't model "one value per brand row."
2. **Multi-tenant** (Phase 5): Each tenant needs its own sender domain.
   Env vars model "one value per deployment," which forces one Vercel
   deployment per tenant — defeating the modular monolith's
   single-deployment story.
3. **Self-service editing**: "Change my company's From name" should be a
   2-click setting, not an SSH-and-redeploy operation. Five-minute test
   fails today.

This ADR draws the line cleanly so future tickets don't re-litigate it.

---

## 2. Decision

**Tenant-facing configuration lives in DB rows. Environment variables
are reserved for deployment-environment configuration: secrets,
connection strings, deployment topology, and external-service auth
material.**

The line:

| Lives in env | Lives in DB rows |
|---|---|
| `DATABASE_URL` | Sender domain, sender address, sender name |
| `BETTER_AUTH_SECRET` | Postmark message stream choice |
| `POSTMARK_SERVER_TOKEN` (auth credential) | Org legal name, EIN, address, default currency, default timezone |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Default tax filing status, home state |
| `R2_ENDPOINT` (deployment topology) | Brand display names, brand domains, brand accent colors |
| `APP_BASE_URL` | Business line names, slugs, kinds |

The shape:

1. **Schema first.** Tenant config columns live on `organizations`,
   `brands`, `business_lines`, or other row-scoped tables.
2. **Env vars as bootstrap-only.** Env vars MAY be consumed by seed
   scripts (`apps/web/src/db/seed/**`) to populate row defaults at
   first install. Once seeded, **the application reads from DB, never
   from env at runtime.**
3. **Resolver helpers throw on missing.** A `getXxxConfig(orgId, tx?)`
   function returns the configured values or throws a typed error.
   Mirrors the shape of `findSystemAccount` (P1-08) and
   `findRevenueAccountForBusinessLine` (P1-13).
4. **In-tx lookups.** Where the resolved config drives accounting or
   external-side-effect dispatch (e.g., the From header on an invoice
   email), the lookup happens INSIDE the action's transaction, so a
   misconfigured org fails fast — *before* the journal posts and
   *before* the email goes out.
5. **Audit trail.** Edits to tenant config rows go through `defineAction`
   + `withAudit`. Env edits (Vercel dashboard) leave no audit; row
   edits do.
6. **Settings UI.** Every tenant config column gets a Settings page so
   owners edit values without touching env files.

This rule is binding for all future tickets touching tenant identity,
branding, locale, tax preferences, billing identity, or any other
"this varies per organization" field.

---

## 3. Consequences

### 3.1 Positive

- **Single source of truth** for tenant identity. No "is this from env
  or DB?" debugging.
- **Audit trail** on every edit. Required for compliance (Phase 4+ tax
  reporting must reconstruct who-changed-what-and-when for any field
  that affects the From header on outbound invoices).
- **Multi-tenant ready.** Each org row carries its own values; the env
  shape doesn't change when a second tenant is added in Phase 5.
- **Per-brand sender ready** (Phase 2). When brands gain
  `email_sender_address`, the resolver gains a brand-first / org-fallback
  rule; env doesn't enter the picture.
- **Five-minute test passes.** Owners edit tenant config via Settings,
  not via SSH or Vercel dashboard.
- **Default-good test passes.** Seed populates sensible defaults from
  env at install time; UI lets the owner refine without breaking
  anything.

### 3.2 Negative

- **Initial deploy needs a seed step** to populate the row before
  outbound emails work. Mitigated by the bootstrap-from-env behavior
  in seed scripts: a fresh deploy with `POSTMARK_FROM_ADDRESS=...` set
  in env produces a working seed without manual SQL.
- **One extra in-tx lookup** per `sendInvoice` (and every future
  consumer). Negligible — Drizzle resolves a single-row indexed lookup
  in <1ms.
- **Migrations get longer.** Each tenant config column is a column-add
  + backfill. Tolerable; the alternative (env reads) is worse for the
  reasons above.

### 3.3 Neutral

- The pattern composes. Future tickets that add tenant-facing config
  follow the same template: schema column → resolver helper → seed
  bootstrap → Settings UI page. No new infrastructure.
- Env vars don't disappear from the codebase. `lib/env.ts` still
  governs deployment-environment values via zod; the ADR shrinks env's
  scope, it doesn't eliminate env.

---

## 4. Alternatives considered

### 4.1 Keep env-driven and accept the limitation (rejected)

The minimal change. P1-14 already works — leave it.

Rejected because:

- **Conflicts with conventions §3.11.** Tenant data lives in rows;
  env vars are deployment data. The convention exists precisely to
  prevent this kind of leak. Keeping env-driven creates a two-tier
  system where finance/billing/CRM data is row-scoped but email
  identity is deployment-scoped — readers have to remember which.
- **Blocks per-brand sender** (Phase 2). When CXAllies and Pravara.ai
  need different `From:` addresses, env can model "one value per
  deployment" but not "one value per brand row." Phase 2 would need
  to refactor anyway; the cost is paid now or later.
- **Blocks multi-tenant** (Phase 5). Env vars in Vercel are scoped to
  a deployment, not a tenant. Multi-tenant on one deployment is
  impossible with env-driven sender identity.
- **Fails the five-minute test.** Editing the From name requires
  Vercel CLI, redeploy, and a working knowledge of env propagation.
  No SMB owner does that.
- **Fails the default-good test.** A fresh prod deploy with env vars
  cleared (e.g., during incident recovery) has nothing in the DB to
  fall back to.

### 4.2 Hybrid: env wins in production, DB wins in dev (rejected)

Some teams split this way to "minimize prod risk."

Rejected because:

- **NODE_ENV-conditional behavior is the worst kind of bug source.**
  "Works in dev, fails in prod" / "config edit doesn't take in prod"
  becomes a category of incident. Every change has to be tested in
  both modes.
- **Re-entangles the very axis we're separating.** The whole ADR is
  about disentangling deployment-config from tenant-config. A hybrid
  re-entangles them at runtime.
- **Two source-of-truth paths drift.** Audit trail captures DB edits
  but not env edits, so the audit_log lies in prod.
- **Doesn't actually reduce risk.** Prod risk comes from making
  changes without a guardrail. The right guardrail is permission-
  gated edits + audit_log, not "make it harder to change."

### 4.3 Read env at runtime with DB override (rejected)

DB row wins if set; otherwise fall back to env.

Rejected because:

- **Two-source resolution drifts.** "Which value won?" requires
  checking both; the answer differs across tenants and across time.
- **Audit trail incomplete.** Env-sourced values leave no audit row
  even though they affect outbound emails.
- **Env vars stay required.** A "fallback" that's always present is
  effectively required — no progress over option 4.1.
- **Adds resolution complexity.** Every email send branches on
  "row.email_sender_address ?? env.POSTMARK_FROM_ADDRESS" — that
  branching point becomes the spec for every future config column.

### 4.4 Move secrets to DB rows too (rejected)

Symmetry argument: if tenant config goes to DB, why not secrets too?

Rejected because:

- **Read access to the org row leaks the token.** Anyone with
  `auth.read` on `organizations` (or any future `tenant.read`) gets
  the Postmark server token. Today the token is gated to people who
  can read Vercel env (Owner only).
- **Audit_log captures plaintext on edits.** Editing a token via the
  Settings UI writes the new value into `audit_log.after`, which is
  stored unencrypted by default.
- **Secret rotation propagates to backups.** DB writes flow into
  Postgres backups; secret rotation now requires a backup-purge
  policy. Env vars rotate with no backup footprint.
- **Replaces platform KMS with app-managed encryption.** Vercel and
  Railway encrypt env at rest with platform-managed keys; moving to
  DB requires us to roll our own encryption-at-rest, which is the
  thing ADR-0007 does NOT want to do for Phase 1.
- **The line is principled, not arbitrary.** Tenant identity (visible
  in outbound headers, customer-edited) → DB. Deployment credentials
  (used to authenticate the deploy itself, ops-rotated) → env.

OAuth refresh tokens are the one exception: they're per-user secrets
that the user grants and revokes, so they can't live in env. Their
encryption-at-rest design is referenced in ADR-0004 §3.4 and pinned to
its own future ADR.

---

## 5. Implementation reference

The cleanest example of the pattern is the email-identity resolver
introduced in P1-15a:

```
apps/web/src/lib/email/from-org.ts
```

Shape — mirrors `findRevenueAccountForBusinessLine` from P1-13:

```typescript
export class MissingOrgEmailConfigError extends Error {
  readonly fieldErrors: Record<string, string>
  constructor(public readonly organizationId: string, missing: string[]) {
    super(
      `Organization ${organizationId} is missing email config: ${missing.join(', ')}. ` +
        `Set these in Settings → Organization → Email.`,
    )
    this.fieldErrors = Object.fromEntries(missing.map((f) => [f, 'Required']))
    this.name = 'MissingOrgEmailConfigError'
  }
}

export async function getEmailIdentity(
  tx: FinanceTx,
  organizationId: string,
): Promise<{
  fromAddress: string
  fromName: string
  messageStream: string
  domain: string | null
}> {
  // SELECT email_sender_domain, email_sender_address, email_sender_name,
  //        postmark_message_stream
  // FROM organizations WHERE id = $1 LIMIT 1
  // Throw MissingOrgEmailConfigError if any required field is null.
}
```

Callers fetch identity inside their transaction, so a misconfigured
org fails before any external side effect:

```typescript
// inside sendInvoice handler:
const identity = await getEmailIdentity(ctx.tx, ctx.organizationId)
// post journal, update invoice — all inside tx
return {
  result: {...},
  postCommit: async () => {
    await sendEmail({ orgId: ctx.organizationId, fromOverride: undefined, ... })
  },
}
```

The seam for Phase 2 per-brand sender is the optional `fromOverride`
parameter on `sendEmail` — accepted in P1-15a but not branched on. When
brands gain their own `email_sender_address` column, the brand-first
resolver lands behind that seam without changing call sites.

Future row-scoped config follows the same shape: schema column → seed
bootstrap → resolver helper → in-tx lookup → Settings UI page.

---

## 6. Review trigger

Reopen this ADR if any of the following occurs:

1. **Per-brand sender is required and the brand-first resolution rule
   doesn't fit the resolver shape** — most likely Phase 2 lands this
   cleanly, but if brand-level overrides need a different fallback
   chain than the org-only Phase 1 path, the resolver design needs
   revisiting.
2. **Multi-tenant migration introduces env-level defaults again** —
   if Phase 5 finds it useful to ship a "default org config" via env
   for fresh-tenant onboarding, the bootstrap-only rule needs an
   explicit carve-out, not a quiet drift.
3. **DKIM verification flow needs env-side configuration** — Phase 2
   adds DKIM/SPF/DMARC verification UI; if Postmark verification
   webhooks require env-side secrets that interact with the row-level
   identity (e.g., verification status mirrored from env), the line
   between env and row needs re-drawing.
4. **A secret needs to be tenant-editable** — if a tenant ever needs
   to rotate their own Postmark token (unlikely in single-tenant; possible
   in multi-tenant SaaS), §4.4's rejection needs revisiting with a
   proper encryption-at-rest design.

Until one of those triggers fires, this ADR is the reference for any
"should X live in env or in a row?" question.
