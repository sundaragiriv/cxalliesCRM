import { describe, expect, it } from 'vitest'
import {
  TIMESHEET_STATUSES,
  InvalidTimesheetTransitionError,
  assertTransition,
  canEditEntries,
  canSoftDelete,
  isTransitionAllowed,
  nextAllowedStates,
  type TimesheetStatus,
} from '@/modules/billing/lib/timesheets/state-machine'

describe('timesheet state machine', () => {
  it('exports the canonical status set', () => {
    expect(TIMESHEET_STATUSES).toEqual([
      'draft',
      'submitted',
      'approved',
      'rejected',
    ])
  })

  it('allows the documented forward transitions', () => {
    expect(nextAllowedStates('draft')).toEqual(['submitted'])
    expect([...nextAllowedStates('submitted')].sort()).toEqual([
      'approved',
      'rejected',
    ])
    expect(nextAllowedStates('rejected')).toEqual(['draft'])
    expect(nextAllowedStates('approved')).toEqual([])
  })

  it('blocks the disallowed transitions', () => {
    // No recall — same race-window reasoning as P1-09.
    expect(isTransitionAllowed('submitted', 'draft')).toBe(false)
    // Cannot skip approval.
    expect(isTransitionAllowed('draft', 'approved')).toBe(false)
    // Approved is terminal until invoiced (P1-13 invoice action handles entry locking).
    expect(isTransitionAllowed('approved', 'draft')).toBe(false)
    expect(isTransitionAllowed('approved', 'rejected')).toBe(false)
    // Rejected goes only to draft.
    expect(isTransitionAllowed('rejected', 'submitted')).toBe(false)
  })

  it('assertTransition throws InvalidTimesheetTransitionError on bad transitions', () => {
    expect(() => assertTransition('approved', 'draft')).toThrow(
      InvalidTimesheetTransitionError,
    )
    expect(() => assertTransition('submitted', 'draft')).toThrow(
      /Cannot transition timesheet from 'submitted' to 'draft'/,
    )
  })

  it('canEditEntries confines edits to draft', () => {
    expect(canEditEntries('draft')).toBe(true)
    expect(canEditEntries('submitted')).toBe(false)
    expect(canEditEntries('approved')).toBe(false)
    expect(canEditEntries('rejected')).toBe(false)
  })

  it('canSoftDelete blocks only the submitted state', () => {
    expect(canSoftDelete('draft')).toBe(true)
    expect(canSoftDelete('submitted')).toBe(false)
    expect(canSoftDelete('approved')).toBe(true)
    expect(canSoftDelete('rejected')).toBe(true)
  })

  it('every non-start state is reachable from at least one transition', () => {
    const reached = new Set<TimesheetStatus>()
    for (const from of TIMESHEET_STATUSES) {
      for (const to of nextAllowedStates(from)) reached.add(to)
    }
    expect(reached.has('submitted')).toBe(true)
    expect(reached.has('approved')).toBe(true)
    expect(reached.has('rejected')).toBe(true)
  })
})
