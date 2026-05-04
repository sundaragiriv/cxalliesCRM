import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import { organizations } from '@/modules/parties/schema'

function getOrgId(ctx: { user: unknown }): string {
  const orgId = (ctx.user as { organizationId?: string }).organizationId
  if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return orgId
}

/**
 * Read the organization's outbound-email configuration. Per ADR-0007 the
 * org row is the source of truth for tenant identity (sender domain,
 * address, name, message stream) — env vars are bootstrap-only.
 *
 * The Settings → Organization → Email page calls this for both the
 * read-only display and the edit form's initial values.
 *
 * Permission: `parties.read` (admin-only at the action level via the
 * Owner role; non-Owners get FORBIDDEN here through the procedure
 * middleware).
 */
export const organizationRouter = router({
  getEmailConfig: procedureWithAuth({ module: 'parties', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const [row] = await db
        .select({
          id: organizations.id,
          legalName: organizations.legalName,
          displayName: organizations.displayName,
          emailSenderDomain: organizations.emailSenderDomain,
          emailSenderAddress: organizations.emailSenderAddress,
          emailSenderName: organizations.emailSenderName,
          postmarkMessageStream: organizations.postmarkMessageStream,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)

      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        })
      }
      return row
    },
  ),
})
