import type { z } from 'zod'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/db/client'
import { auditLog } from '@/db/shared-tables'
import { requirePermission } from '@/lib/auth/require-permission'
import type { ModuleName, ModuleAction } from '@/lib/auth/permissions'
import type {
  AuditAction,
  AuditedHandlerOutput,
  FinanceTx,
} from '@/lib/audit/with-audit'

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

/**
 * Context passed to every handler. `tx` is the open transaction — every write
 * inside the handler (the entity insert, journal entry, activity emit, etc.)
 * MUST use this `tx` so it commits atomically with the audit_log row.
 */
export type ActionContext = {
  tx: FinanceTx
  userId: string
  organizationId: string
  ipAddress: string | null
  userAgent: string | null
}

export type DefineActionOptions<TInput, TOutput> = {
  permission: { module: ModuleName; action: ModuleAction }
  audit: { table: string; action: AuditAction }
  schema: z.ZodSchema<TInput>
  handler: (
    input: TInput,
    ctx: ActionContext,
  ) => Promise<AuditedHandlerOutput<TOutput>>
}

/**
 * Unified Server Action entry point per conventions §4.4–§4.8.
 *
 * Order of operations inside one call:
 *  1. Resolve session from request headers; reject if no user.
 *  2. Resolve organization_id from the session user; reject if missing.
 *  3. Check the (module, action) permission against the user's roles.
 *  4. Parse `raw` against the zod schema; on failure return ActionResult with
 *     fieldErrors so react-hook-form can surface inline messages.
 *  5. Open a single `db.transaction` and pass `tx` to the handler via ctx.
 *  6. Handler does its writes through ctx.tx and returns AuditedHandlerOutput.
 *  7. Insert audit_log row using the same tx.
 *  8. Commit (or roll back if any step throws).
 */
export function defineAction<TInput, TOutput>(
  opts: DefineActionOptions<TInput, TOutput>,
): (raw: unknown) => Promise<ActionResult<TOutput>> {
  return async (raw): Promise<ActionResult<TOutput>> => {
    const reqHeaders = await headers()
    const session = await auth.api.getSession({ headers: reqHeaders })

    if (!session?.user) {
      return { success: false, error: 'Not signed in' }
    }

    const organizationId = (session.user as { organizationId?: string }).organizationId
    if (!organizationId) {
      return { success: false, error: 'Missing organization context' }
    }

    const allowed = await requirePermission(
      session.user.id,
      opts.permission.module,
      opts.permission.action,
    )
    if (!allowed) {
      return {
        success: false,
        error: `Missing permission: ${opts.permission.module}.${opts.permission.action}`,
      }
    }

    const parsed = opts.schema.safeParse(raw)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.')
        if (path && !fieldErrors[path]) fieldErrors[path] = issue.message
      }
      return { success: false, error: 'Validation failed', fieldErrors }
    }

    const ipAddress = reqHeaders.get('x-forwarded-for')
    const userAgent = reqHeaders.get('user-agent')

    try {
      const committed = await db.transaction(async (tx) => {
        const ctx: ActionContext = {
          tx,
          userId: session.user.id,
          organizationId,
          ipAddress,
          userAgent,
        }

        const output = await opts.handler(parsed.data, ctx)

        await tx.insert(auditLog).values({
          organizationId,
          action: opts.audit.action,
          tableName: opts.audit.table,
          recordId: output.recordId,
          before: output.before ?? null,
          after: output.after ?? null,
          actorUserId: session.user.id,
          ipAddress,
          userAgent,
        })

        return { result: output.result, postCommit: output.postCommit }
      })

      // External side effects (email, webhooks) run AFTER the tx commits.
      // A failure here does NOT roll back the committed DB writes — the
      // thunk reports its own success/failure via fields that get merged
      // into `data`.
      if (committed.postCommit) {
        const extra = await committed.postCommit()
        return { success: true, data: { ...committed.result, ...extra } }
      }

      return { success: true, data: committed.result }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: message }
    }
  }
}
