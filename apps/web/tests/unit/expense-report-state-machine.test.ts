import { describe, expect, it } from 'vitest'
import {
  EXPENSE_REPORT_STATUSES,
  InvalidExpenseReportTransitionError,
  assertTransition,
  canEditContent,
  canSoftDelete,
  isTransitionAllowed,
  nextAllowedStates,
  type ExpenseReportStatus,
} from '@/modules/finance/lib/expense-reports/state-machine'

describe('expense report state machine', () => {
  it('exports the canonical status set', () => {
    expect(EXPENSE_REPORT_STATUSES).toEqual([
      'draft',
      'submitted',
      'approved',
      'rejected',
      'reimbursed',
    ])
  })

  it('allows the documented forward transitions', () => {
    expect(nextAllowedStates('draft')).toEqual(['submitted'])
    expect([...nextAllowedStates('submitted')].sort()).toEqual(['approved', 'rejected'])
    expect([...nextAllowedStates('approved')].sort()).toEqual(['reimbursed', 'rejected'])
    expect(nextAllowedStates('rejected')).toEqual(['draft'])
    expect(nextAllowedStates('reimbursed')).toEqual([])
  })

  it('blocks the disallowed transitions', () => {
    // Cannot recall a submitted report (rejected by design — reject + reopen instead).
    expect(isTransitionAllowed('submitted', 'draft')).toBe(false)
    // Cannot skip approval — draft cannot go straight to approved.
    expect(isTransitionAllowed('draft', 'approved')).toBe(false)
    // Reimbursed is terminal.
    expect(isTransitionAllowed('reimbursed', 'draft')).toBe(false)
    expect(isTransitionAllowed('reimbursed', 'rejected')).toBe(false)
    // Rejected can only go to draft, not directly back to submitted.
    expect(isTransitionAllowed('rejected', 'submitted')).toBe(false)
  })

  it('assertTransition throws InvalidExpenseReportTransitionError on bad transitions', () => {
    expect(() => assertTransition('reimbursed', 'draft')).toThrow(
      InvalidExpenseReportTransitionError,
    )
    expect(() => assertTransition('submitted', 'draft')).toThrow(
      /Cannot transition expense report from 'submitted' to 'draft'/,
    )
  })

  it('canEditContent confines edits to draft', () => {
    expect(canEditContent('draft')).toBe(true)
    expect(canEditContent('submitted')).toBe(false)
    expect(canEditContent('approved')).toBe(false)
    expect(canEditContent('rejected')).toBe(false)
    expect(canEditContent('reimbursed')).toBe(false)
  })

  it('canSoftDelete blocks only the submitted state', () => {
    expect(canSoftDelete('draft')).toBe(true)
    expect(canSoftDelete('submitted')).toBe(false) // must approve/reject first
    expect(canSoftDelete('approved')).toBe(true)
    expect(canSoftDelete('rejected')).toBe(true)
    expect(canSoftDelete('reimbursed')).toBe(true) // double-reversal handles journals
  })

  it('there are no unreachable states', () => {
    // Every status except the start state must be reachable from at least one other.
    const reachableFromAnyone = new Set<ExpenseReportStatus>()
    for (const from of EXPENSE_REPORT_STATUSES) {
      for (const to of nextAllowedStates(from)) reachableFromAnyone.add(to)
    }
    // 'draft' is the seed state, so we don't require it to be reachable;
    // every other status MUST be a transition target somewhere.
    expect(reachableFromAnyone.has('submitted')).toBe(true)
    expect(reachableFromAnyone.has('approved')).toBe(true)
    expect(reachableFromAnyone.has('rejected')).toBe(true)
    expect(reachableFromAnyone.has('reimbursed')).toBe(true)
  })
})
