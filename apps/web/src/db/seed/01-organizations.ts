import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { organizations } from '@/modules/parties/schema'

const VARAHI_GROUP_LEGAL_NAME = 'Varahi Group LLC'

/**
 * Bootstrap defaults for organization email config when env vars are unset
 * on a fresh laptop. Values are placeholders only — they let `pnpm db:seed`
 * succeed and produce a queryable row even without prod env. Owners
 * customize via Settings → Organization → Email after install. Per
 * ADR-0007, runtime never reads env for these — only seed does.
 */
const PLACEHOLDER_SENDER_DOMAIN = 'cxallies.local'
const PLACEHOLDER_SENDER_ADDRESS = 'invoices@cxallies.local'
const PLACEHOLDER_SENDER_NAME = 'CXAllies'
const DEFAULT_MESSAGE_STREAM = 'outbound'

function bootstrapEmailConfig(): {
  emailSenderDomain: string
  emailSenderAddress: string
  emailSenderName: string
  postmarkMessageStream: string
} {
  // Read process.env directly (not via lib/env.ts) — these vars are
  // optional in the runtime env schema; seed treats them as bootstrap
  // input. Falling back to placeholders keeps a fresh laptop install
  // working without any prod-shaped env.
  const fromAddress = process.env.POSTMARK_FROM_ADDRESS?.trim() || PLACEHOLDER_SENDER_ADDRESS
  const fromName = process.env.POSTMARK_FROM_NAME?.trim() || PLACEHOLDER_SENDER_NAME
  const stream =
    process.env.POSTMARK_MESSAGE_STREAM?.trim() || DEFAULT_MESSAGE_STREAM

  // Derive domain from address if env doesn't pin it explicitly.
  const derivedDomain = fromAddress.includes('@')
    ? fromAddress.slice(fromAddress.indexOf('@') + 1)
    : PLACEHOLDER_SENDER_DOMAIN

  return {
    emailSenderDomain: derivedDomain,
    emailSenderAddress: fromAddress,
    emailSenderName: fromName,
    postmarkMessageStream: stream,
  }
}

/**
 * Returns the Varahi Group organization id. Idempotent — looks up by
 * legal_name first.
 *
 * On first install: inserts the org with email config bootstrapped from
 * env (or placeholders). On re-run with an existing org: only backfills
 * email columns that are NULL — never overwrites values the owner has
 * since edited via Settings UI (per P1-15a spec).
 *
 * Per conventions §3.10 we never hardcode the UUID; callers resolve at
 * runtime.
 */
export async function seedOrganizations(): Promise<string> {
  const [existing] = await db
    .select({
      id: organizations.id,
      emailSenderDomain: organizations.emailSenderDomain,
      emailSenderAddress: organizations.emailSenderAddress,
      emailSenderName: organizations.emailSenderName,
      postmarkMessageStream: organizations.postmarkMessageStream,
    })
    .from(organizations)
    .where(eq(organizations.legalName, VARAHI_GROUP_LEGAL_NAME))
    .limit(1)

  if (existing) {
    // Backfill only NULL email columns from env. The Settings UI is the
    // source of truth once the owner has touched them.
    const bootstrap = bootstrapEmailConfig()
    const patch: Partial<typeof organizations.$inferInsert> = {}
    if (existing.emailSenderDomain == null) patch.emailSenderDomain = bootstrap.emailSenderDomain
    if (existing.emailSenderAddress == null) patch.emailSenderAddress = bootstrap.emailSenderAddress
    if (existing.emailSenderName == null) patch.emailSenderName = bootstrap.emailSenderName
    // postmarkMessageStream is NOT NULL DEFAULT 'outbound' so skip.
    if (Object.keys(patch).length > 0) {
      await db.update(organizations).set(patch).where(eq(organizations.id, existing.id))
    }
    return existing.id
  }

  const bootstrap = bootstrapEmailConfig()
  const [inserted] = await db
    .insert(organizations)
    .values({
      legalName: VARAHI_GROUP_LEGAL_NAME,
      displayName: 'Varahi Group',
      homeState: 'NC',
      defaultCurrency: 'USD',
      defaultTimezone: 'America/New_York',
      defaultFilingStatus: 'married_jointly',
      ...bootstrap,
    })
    .returning({ id: organizations.id })

  if (!inserted) {
    throw new Error('Failed to insert Varahi Group organization')
  }
  return inserted.id
}
