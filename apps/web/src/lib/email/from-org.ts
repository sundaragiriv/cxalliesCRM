import { eq } from 'drizzle-orm'
import { organizations } from '@/modules/parties/schema'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Thrown when an outbound-email caller can't resolve the From identity
 * for an organization because one or more required columns is null.
 *
 * Mirrors the shape of:
 *   - MissingSystemAccountError  (P1-08, modules/finance/lib/system-accounts.ts)
 *   - MissingRevenueAccountError (P1-13, modules/finance/lib/revenue-accounts.ts)
 *
 * `fieldErrors` lets the Settings UI form bind to react-hook-form's
 * `setError` and surface "Required" inline next to the missing fields.
 */
export class MissingOrgEmailConfigError extends Error {
  readonly fieldErrors: Record<string, string>
  constructor(
    public readonly organizationId: string,
    public readonly missing: ReadonlyArray<
      'emailSenderAddress' | 'emailSenderName' | 'postmarkMessageStream'
    >,
  ) {
    super(
      `Organization ${organizationId} is missing email config: ${missing.join(', ')}. ` +
        `Set these in Settings → Organization → Email before sending invoices.`,
    )
    this.fieldErrors = Object.fromEntries(missing.map((f) => [f, 'Required']))
    this.name = 'MissingOrgEmailConfigError'
  }
}

export type EmailIdentity = {
  fromAddress: string
  fromName: string
  messageStream: string
  /** Domain stamped on the row at seed/edit time. Informational; not parsed. */
  domain: string | null
}

/**
 * Resolve the outbound email identity for an organization.
 *
 * Per ADR-0007, env vars no longer drive runtime From headers. This
 * helper is the single resolution point for email identity; every
 * caller (sendInvoice today, future reminder/receipt emails) goes
 * through it.
 *
 * Called INSIDE the action's transaction so a misconfigured org throws
 * before the journal posts and before the email request is built.
 *
 * The optional `fromOverride` parameter is the seam reserved for the
 * Phase 2 per-brand sender feature — when brands gain their own
 * `email_sender_address`, the brand-first / org-fallback resolver
 * lands behind that seam without changing call sites. P1-15a accepts
 * the param at the email-send boundary but does not branch on it.
 */
export async function getEmailIdentity(
  tx: FinanceTx,
  organizationId: string,
): Promise<EmailIdentity> {
  const [row] = await tx
    .select({
      domain: organizations.emailSenderDomain,
      address: organizations.emailSenderAddress,
      name: organizations.emailSenderName,
      stream: organizations.postmarkMessageStream,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1)

  if (!row) {
    throw new MissingOrgEmailConfigError(organizationId, [
      'emailSenderAddress',
      'emailSenderName',
      'postmarkMessageStream',
    ])
  }

  const missing: Array<
    'emailSenderAddress' | 'emailSenderName' | 'postmarkMessageStream'
  > = []
  if (!row.address) missing.push('emailSenderAddress')
  if (!row.name) missing.push('emailSenderName')
  // postmark_message_stream is NOT NULL with default 'outbound'; this branch
  // exists for the unreachable case where someone manually nulls it via psql.
  if (!row.stream) missing.push('postmarkMessageStream')

  if (missing.length > 0) {
    throw new MissingOrgEmailConfigError(organizationId, missing)
  }

  return {
    fromAddress: row.address!,
    fromName: row.name!,
    messageStream: row.stream!,
    domain: row.domain,
  }
}
