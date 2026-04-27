import { db } from '@/db/client'

export type AuditAction = 'insert' | 'update' | 'delete' | 'soft_delete' | 'restore'

/**
 * Drizzle's tx callback parameter type. Threading this through Server Action
 * handlers + emit helpers means every write inside one defineAction commits
 * (or rolls back) atomically.
 */
export type FinanceTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Shape an audited handler must return:
 *  - `result`: the value returned to the caller (forwarded by defineAction)
 *  - `recordId`: written to audit_log.record_id
 *  - `before` / `after`: snapshots written to audit_log.before / after
 */
export type AuditedHandlerOutput<TResult> = {
  result: TResult
  recordId: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}
