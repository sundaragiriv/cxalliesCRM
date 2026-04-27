import type { z } from 'zod'
import { withPermission, type ActionResult } from '@/lib/auth/with-permission'
import { withAudit, type AuditAction, type AuditedHandlerOutput } from '@/lib/audit/with-audit'
import { withZod } from './with-zod'
import type { ModuleName, ModuleAction } from '@/lib/auth/permissions'

export type DefineActionOptions<TInput, TOutput> = {
  permission: { module: ModuleName; action: ModuleAction }
  audit: { table: string; action: AuditAction }
  schema: z.ZodSchema<TInput>
  /**
   * The handler runs after permission + zod parse. Return the audit-shaped
   * output: `{ result, recordId, before?, after? }`. `result` is what the
   * caller receives wrapped in `ActionResult.data`; before/after populate the
   * audit_log row.
   */
  handler: (input: TInput) => Promise<AuditedHandlerOutput<TOutput>>
}

/**
 * Unified Server Action helper that composes the three middleware layers
 * (`withPermission` → `withAudit` → `withZod`) per conventions §4.4–§4.8.
 *
 *   export const createExpense = defineAction({
 *     permission: { module: 'finance', action: 'write' },
 *     audit: { table: 'finance_expense_entries', action: 'insert' },
 *     schema: createExpenseSchema,
 *     handler: async (input) => {
 *       const [row] = await db.insert(...).returning()
 *       return { result: row, recordId: row.id, after: row }
 *     },
 *   })
 *
 * Returns `(raw: unknown) => Promise<ActionResult<TOutput>>` ready to be
 * exported as a Server Action.
 */
export function defineAction<TInput, TOutput>(
  opts: DefineActionOptions<TInput, TOutput>,
): (raw: unknown) => Promise<ActionResult<TOutput>> {
  return withPermission(
    opts.permission.module,
    opts.permission.action,
    withAudit(opts.audit.table, opts.audit.action, withZod(opts.schema, opts.handler)),
  )
}
