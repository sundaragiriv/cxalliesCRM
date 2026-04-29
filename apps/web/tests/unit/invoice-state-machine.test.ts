import { describe, expect, it } from 'vitest'
import {
  INVOICE_STATUSES,
  InvalidInvoiceTransitionError,
  assertTransition,
  canEditContent,
  canSoftDelete,
  isOverdue,
  isTransitionAllowed,
  nextAllowedStates,
} from '@/modules/billing/lib/invoices/state-machine'

describe('invoice state machine', () => {
  it('exports the canonical status set', () => {
    expect(INVOICE_STATUSES).toEqual([
      'draft',
      'sent',
      'partially_paid',
      'paid',
      'overdue',
      'void',
      'canceled',
    ])
  })

  it('allows the documented forward transitions', () => {
    expect(nextAllowedStates('draft')).toEqual(['sent'])
    expect([...nextAllowedStates('sent')].sort()).toEqual([
      'paid',
      'partially_paid',
      'void',
    ])
    expect(nextAllowedStates('partially_paid')).toEqual(['paid'])
    expect(nextAllowedStates('paid')).toEqual([])
    expect(nextAllowedStates('void')).toEqual([])
  })

  it('blocks the disallowed transitions', () => {
    expect(isTransitionAllowed('draft', 'paid')).toBe(false)
    expect(isTransitionAllowed('paid', 'void')).toBe(false)
    expect(isTransitionAllowed('partially_paid', 'void')).toBe(false) // refund Phase 2
    expect(isTransitionAllowed('void', 'draft')).toBe(false)
  })

  it('throws InvalidInvoiceTransitionError on bad transitions', () => {
    expect(() => assertTransition('paid', 'void')).toThrow(
      InvalidInvoiceTransitionError,
    )
    expect(() => assertTransition('draft', 'paid')).toThrow(
      /Cannot transition invoice from 'draft' to 'paid'/,
    )
  })

  it('canEditContent confines edits to draft', () => {
    expect(canEditContent('draft')).toBe(true)
    expect(canEditContent('sent')).toBe(false)
    expect(canEditContent('paid')).toBe(false)
    expect(canEditContent('void')).toBe(false)
  })

  it('canSoftDelete allows draft and void; blocks sent/paid/partial', () => {
    expect(canSoftDelete('draft')).toBe(true)
    expect(canSoftDelete('void')).toBe(true)
    expect(canSoftDelete('sent')).toBe(false)
    expect(canSoftDelete('partially_paid')).toBe(false)
    expect(canSoftDelete('paid')).toBe(false)
  })

  it('isOverdue is computed per due date + status; never written', () => {
    const today = new Date('2026-04-28T00:00:00Z')
    // Sent past-due → overdue.
    expect(isOverdue('sent', '2026-04-15', today)).toBe(true)
    expect(isOverdue('partially_paid', '2026-04-15', today)).toBe(true)
    // Sent in the future → not overdue.
    expect(isOverdue('sent', '2026-05-15', today)).toBe(false)
    // Not in a sendable state → never overdue.
    expect(isOverdue('draft', '2020-01-01', today)).toBe(false)
    expect(isOverdue('paid', '2020-01-01', today)).toBe(false)
    expect(isOverdue('void', '2020-01-01', today)).toBe(false)
  })
})
