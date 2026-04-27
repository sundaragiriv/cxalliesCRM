/**
 * Expense report state machine.
 *
 * Per conventions §3.11 — the transition graph is data, not switch statements
 * scattered across components. UI consumes `nextAllowedStates(status)` to
 * show/hide action buttons; mutations call `assertTransition(from, to)` to
 * gate journal-posting side effects on a valid transition.
 *
 * Phase 1 graph:
 *
 *   draft       → submitted   (submitExpenseReport)
 *   draft       → [soft delete]
 *   submitted   → approved    (approveExpenseReport)        posts approval journal
 *   submitted   → rejected    (rejectExpenseReport)
 *   approved    → reimbursed  (markReimbursed)              posts reimbursement journal
 *   approved    → rejected    (rejectExpenseReport)         reverses approval journal
 *   rejected    → draft       (reopenExpenseReport)         for resubmit
 *   rejected    → [soft delete]
 *   reimbursed  → [terminal — soft delete reverses both journals]
 *
 * Notes:
 *   - 'submitted → draft' (recall) is intentionally absent; it introduces a
 *     race window in Phase 2 multi-user. Use reject + reopen instead.
 *   - 'approved → rejected' is allowed and triggers a journal reversal.
 *   - Soft delete is a separate axis from status transitions — represented
 *     here as the implicit edge "any non-reimbursed status → soft delete".
 *     Reimbursed soft-delete reverses both journals; other states reverse
 *     none (no journal posted).
 */

export const EXPENSE_REPORT_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'reimbursed',
] as const

export type ExpenseReportStatus = (typeof EXPENSE_REPORT_STATUSES)[number]

const TRANSITIONS: Readonly<Record<ExpenseReportStatus, readonly ExpenseReportStatus[]>> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['reimbursed', 'rejected'],
  rejected: ['draft'],
  reimbursed: [],
}

export function nextAllowedStates(
  status: ExpenseReportStatus,
): readonly ExpenseReportStatus[] {
  return TRANSITIONS[status]
}

export function isTransitionAllowed(
  from: ExpenseReportStatus,
  to: ExpenseReportStatus,
): boolean {
  return TRANSITIONS[from].includes(to)
}

export class InvalidExpenseReportTransitionError extends Error {
  constructor(
    public readonly from: ExpenseReportStatus,
    public readonly to: ExpenseReportStatus,
  ) {
    super(
      `Cannot transition expense report from '${from}' to '${to}'. ` +
        `Allowed from '${from}': [${TRANSITIONS[from].join(', ') || 'terminal'}].`,
    )
    this.name = 'InvalidExpenseReportTransitionError'
  }
}

export function assertTransition(
  from: ExpenseReportStatus,
  to: ExpenseReportStatus,
): void {
  if (!isTransitionAllowed(from, to)) {
    throw new InvalidExpenseReportTransitionError(from, to)
  }
}

/**
 * Whether the report can be soft-deleted from its current status. Allowed in
 * any state except 'submitted' (lock pending decision) — submitted reports must
 * route through approve/reject before deletion.
 *
 * Reimbursed soft-delete is allowed but the action handler must reverse both
 * journals; all other states have no journal to reverse.
 */
export function canSoftDelete(status: ExpenseReportStatus): boolean {
  return status !== 'submitted'
}

/**
 * Whether the report's content (purpose, dates, project, business line, and
 * expense membership) can be edited from its current status. Confined to draft
 * by design — once submitted, the report is immutable until reject + reopen.
 */
export function canEditContent(status: ExpenseReportStatus): boolean {
  return status === 'draft'
}
