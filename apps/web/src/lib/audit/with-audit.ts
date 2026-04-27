import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/db/client'
import { auditLog } from '@/db/shared-tables'

export type AuditAction = 'insert' | 'update' | 'delete' | 'soft_delete' | 'restore'

/**
 * Shape returned by an audited handler:
 *  - `result`: the value returned to the caller (forwarded by withAudit)
 *  - `recordId`: written to audit_log.record_id
 *  - `before` / `after`: snapshots written to audit_log.before / after
 */
export type AuditedHandlerOutput<TResult> = {
  result: TResult
  recordId: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

/**
 * Audit middleware HOF for Server Actions per conventions §4.8.
 *
 * Composes with withPermission cleanly:
 *
 *   export const createExpense = withPermission('finance', 'write',
 *     withAudit('finance_expense_entries', 'insert', async (input) => {
 *       const [row] = await db.insert(expenseEntries).values({...}).returning()
 *       return { result: row, recordId: row.id, after: row }
 *     })
 *   )
 *
 * withAudit returns just `result` to the caller; withPermission wraps that in
 * ActionResult<typeof result>.
 */
export function withAudit<TInput, TResult>(
  tableName: string,
  action: AuditAction,
  fn: (input: TInput) => Promise<AuditedHandlerOutput<TResult>>,
): (input: TInput) => Promise<TResult> {
  return async (input: TInput) => {
    const reqHeaders = await headers()
    const session = await auth.api.getSession({ headers: reqHeaders })

    const ctx = await fn(input)

    const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId
    if (!orgId) {
      throw new Error('withAudit requires an authenticated user with an organization_id')
    }

    await db.insert(auditLog).values({
      organizationId: orgId,
      action,
      tableName,
      recordId: ctx.recordId,
      before: ctx.before ?? null,
      after: ctx.after ?? null,
      actorUserId: session?.user.id ?? null,
      ipAddress: reqHeaders.get('x-forwarded-for') ?? null,
      userAgent: reqHeaders.get('user-agent') ?? null,
    })

    return ctx.result
  }
}
