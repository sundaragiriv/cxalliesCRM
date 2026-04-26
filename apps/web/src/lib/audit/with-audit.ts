import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/db/client'
import { auditLog } from '@/db/shared-tables'

export type AuditAction = 'insert' | 'update' | 'delete' | 'soft_delete' | 'restore'

export type AuditContext = {
  /** Optional snapshot of the row before mutation (for update/delete). */
  before?: Record<string, unknown>
  /** Snapshot of the row after mutation. */
  after?: Record<string, unknown>
  /** The record's id; recorded in audit_log.record_id. */
  recordId: string
}

/**
 * Audit middleware HOF for Server Actions per conventions §4.8.
 *
 * The wrapped function returns an AuditContext describing what changed; this HOF
 * writes the audit_log row from that context plus the calling user/session info.
 *
 *   export const createExpense = withAudit(
 *     'finance_expense_entries',
 *     'insert',
 *     async (input: CreateExpenseInput) => {
 *       const expense = await db.insert(...).returning(...)[0];
 *       return { recordId: expense.id, after: expense };
 *     }
 *   );
 */
export function withAudit<TInput>(
  tableName: string,
  action: AuditAction,
  fn: (input: TInput) => Promise<AuditContext>,
): (input: TInput) => Promise<{ recordId: string }> {
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

    return { recordId: ctx.recordId }
  }
}
