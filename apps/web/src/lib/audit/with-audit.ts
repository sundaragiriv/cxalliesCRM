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
 *  - `postCommit`: optional thunk fired after the transaction commits.
 *    Use for external side effects (email, webhooks, third-party APIs)
 *    that must NOT roll back if the action's DB writes succeeded. The
 *    thunk's resolved value is merged into `result` via shallow spread,
 *    so callers see one combined object.
 *
 *    Failure inside `postCommit` does NOT roll back the committed tx —
 *    the thunk owns its own error handling and surfaces results through
 *    the merged-in fields (e.g., `{ emailSent: true | false, emailError? }`).
 */
export type AuditedHandlerOutput<TResult> = {
  result: TResult
  recordId: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  postCommit?: () => Promise<Partial<TResult>>
}
