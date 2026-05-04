'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { organizations } from '@/modules/parties/schema'
import { defineAction } from '@/lib/actions/define-action'

const SOURCE_TABLE = 'organizations'

export const updateOrganizationEmailConfigSchema = z.object({
  emailSenderDomain: z
    .string()
    .trim()
    .min(1, 'Domain is required')
    .max(253, 'Domain too long')
    // Loose host syntax check; real verification is the Postmark DKIM
    // flow (Phase 2). Accept things like `cxallies.local` for dev.
    .regex(/^[a-zA-Z0-9.-]+$/, 'Use letters, digits, dots, and hyphens only'),
  emailSenderAddress: z.string().trim().email('Must be a valid email address'),
  emailSenderName: z
    .string()
    .trim()
    .min(1, 'Sender name is required')
    .max(100, 'Sender name too long'),
  postmarkMessageStream: z
    .string()
    .trim()
    .min(1, 'Message stream is required')
    .max(100, 'Message stream too long'),
})
export type UpdateOrganizationEmailConfigInput = z.infer<
  typeof updateOrganizationEmailConfigSchema
>

/**
 * Update the organization's outbound-email configuration.
 *
 * Per ADR-0007: tenant identity (sender domain, address, name, message
 * stream) is owned by the org row, not env. This action is the only
 * write path; env edits do not propagate. The audit_log row produced
 * by `defineAction` records who changed what and when.
 *
 * Permission: `parties.admin`. Owner role only in Phase 1 per the RBAC
 * matrix (admin / bookkeeper / sales / support_agent get FORBIDDEN
 * because they don't carry `parties.admin`).
 */
export const updateOrganizationEmailConfig = defineAction({
  permission: { module: 'parties', action: 'admin' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: updateOrganizationEmailConfigSchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId))
      .limit(1)
    if (!before) throw new Error('Organization not found')

    const [row] = await ctx.tx
      .update(organizations)
      .set({
        emailSenderDomain: input.emailSenderDomain,
        emailSenderAddress: input.emailSenderAddress,
        emailSenderName: input.emailSenderName,
        postmarkMessageStream: input.postmarkMessageStream,
      })
      .where(eq(organizations.id, ctx.organizationId))
      .returning()
    if (!row) throw new Error('Failed to update organization email config')

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})
