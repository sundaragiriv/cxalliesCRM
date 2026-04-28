/**
 * Timesheet state machine.
 *
 * Per conventions §3.11 — transition graph as data, not switch statements
 * scattered across components. Mirrors the expense-report state machine
 * (P1-09) for consistency; same recall-vs-reject rationale applies.
 *
 *   draft     → submitted   (submitTimesheet)
 *   submitted → approved    (approveTimesheet)        cascades entries to 'approved'
 *   submitted → rejected    (rejectTimesheet)         cascades entries to 'rejected'
 *   rejected  → draft       (reopenTimesheet)         for resubmit
 *   rejected  → [soft delete]
 *   approved  → [terminal until invoiced]             P1-13 flips entries to 'invoiced'
 *
 * Notes:
 *   - 'submitted → draft' (recall) intentionally absent: introduces a race
 *     window in Phase 2 multi-user (submitter pulls back while approver
 *     is mid-approve). Use reject + reopen for the "I want to edit a
 *     submitted timesheet" case.
 *   - 'approved' is terminal in P1-12. P1-13 invoicing locks entries
 *     further (approved → invoiced) but doesn't move the timesheet's status.
 *   - No journal posting on any transition — time entries become revenue
 *     only via invoice posting (P1-13).
 */

export const TIMESHEET_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
] as const

export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number]

const TRANSITIONS: Readonly<Record<TimesheetStatus, readonly TimesheetStatus[]>> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: [], // terminal until invoiced (P1-13)
  rejected: ['draft'],
}

export function nextAllowedStates(
  status: TimesheetStatus,
): readonly TimesheetStatus[] {
  return TRANSITIONS[status]
}

export function isTransitionAllowed(
  from: TimesheetStatus,
  to: TimesheetStatus,
): boolean {
  return TRANSITIONS[from].includes(to)
}

export class InvalidTimesheetTransitionError extends Error {
  constructor(
    public readonly from: TimesheetStatus,
    public readonly to: TimesheetStatus,
  ) {
    super(
      `Cannot transition timesheet from '${from}' to '${to}'. ` +
        `Allowed from '${from}': [${TRANSITIONS[from].join(', ') || 'terminal'}].`,
    )
    this.name = 'InvalidTimesheetTransitionError'
  }
}

export function assertTransition(
  from: TimesheetStatus,
  to: TimesheetStatus,
): void {
  if (!isTransitionAllowed(from, to)) {
    throw new InvalidTimesheetTransitionError(from, to)
  }
}

/**
 * Whether the timesheet's content (its time entries) can be edited at the
 * given status. Confined to draft by design — once submitted, the
 * timesheet is immutable until reject + reopen.
 */
export function canEditEntries(status: TimesheetStatus): boolean {
  return status === 'draft'
}

/**
 * Whether a soft-delete is allowed at the given status. submitted is
 * locked (must approve/reject first). approved is allowed but blocked at
 * the action layer if any entries are 'invoiced' — that gate lives in
 * P1-13 once invoice locking is wired.
 */
export function canSoftDelete(status: TimesheetStatus): boolean {
  return status !== 'submitted'
}
