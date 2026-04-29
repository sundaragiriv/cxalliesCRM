import { describe, expect, it } from 'vitest'
import {
  MultiCurrencyInvoiceError,
  generateInvoiceLines,
  type SourceExpenseEntry,
  type SourceTimeEntry,
} from '@/modules/billing/lib/invoices/generator'

const baseTime: Omit<SourceTimeEntry, 'id' | 'entryDate' | 'description' | 'hoursText'> = {
  billableRateCents: 20000, // $200/h
  currencyCode: 'USD',
  projectId: 'project-A',
}

const baseExpense: Omit<
  SourceExpenseEntry,
  'id' | 'entryDate' | 'description' | 'amountCents'
> = {
  currencyCode: 'USD',
  projectId: 'project-A',
  chartOfAccountsId: 'expense-acct',
}

describe('invoice generator', () => {
  it('returns empty result when no sources', () => {
    const r = generateInvoiceLines({ timeEntries: [], expenses: [] })
    expect(r.lines).toEqual([])
    expect(r.subtotalCents).toBe(0)
    expect(r.periodStart).toBeNull()
    expect(r.periodEnd).toBeNull()
    expect(r.currencyCode).toBe('USD')
  })

  it('snapshots time entry description + rate verbatim (§3.13)', () => {
    const r = generateInvoiceLines({
      timeEntries: [
        {
          ...baseTime,
          id: 't1',
          entryDate: '2026-04-27',
          description: 'Sprint planning',
          hoursText: '2.50',
        },
      ],
      expenses: [],
    })
    expect(r.lines).toHaveLength(1)
    const line = r.lines[0]!
    expect(line.kind).toBe('time')
    expect(line.description).toBe('Sprint planning') // SNAPSHOT
    expect(line.unitPriceCents).toBe(20000) // SNAPSHOT
    expect(line.quantityText).toBe('2.50')
    expect(line.amountCents).toBe(50000) // 2.5 × $200 = $500
    expect(line.sourceTimeEntryId).toBe('t1')
    expect(r.subtotalCents).toBe(50000)
  })

  it('handles fractional hours without floating-point drift', () => {
    const r = generateInvoiceLines({
      timeEntries: [
        {
          ...baseTime,
          id: 't1',
          entryDate: '2026-04-27',
          description: '15-min check',
          hoursText: '0.25',
        },
        {
          ...baseTime,
          id: 't2',
          entryDate: '2026-04-28',
          description: '45-min review',
          hoursText: '0.75',
        },
      ],
      expenses: [],
    })
    // 0.25 × 200 = 50 + 0.75 × 200 = 150 → 200
    expect(r.subtotalCents).toBe(20000)
  })

  it('orders lines by entry_date asc; time before expenses', () => {
    const r = generateInvoiceLines({
      timeEntries: [
        {
          ...baseTime,
          id: 't1',
          entryDate: '2026-04-29',
          description: 'B',
          hoursText: '1.00',
        },
        {
          ...baseTime,
          id: 't2',
          entryDate: '2026-04-27',
          description: 'A',
          hoursText: '1.00',
        },
      ],
      expenses: [
        { ...baseExpense, id: 'e1', entryDate: '2026-04-26', description: 'Travel', amountCents: 5000 },
      ],
    })
    expect(r.lines.map((l) => l.lineNumber)).toEqual([1, 2, 3])
    // Time first, ordered by date asc within section.
    expect(r.lines[0]!.description).toBe('A')
    expect(r.lines[1]!.description).toBe('B')
    expect(r.lines[2]!.kind).toBe('expense')
  })

  it('rejects mixed currencies with a remediation message', () => {
    expect(() =>
      generateInvoiceLines({
        timeEntries: [
          {
            ...baseTime,
            id: 't1',
            entryDate: '2026-04-27',
            description: 'A',
            hoursText: '1.00',
          },
          {
            ...baseTime,
            id: 't2',
            entryDate: '2026-04-28',
            description: 'B',
            hoursText: '1.00',
            currencyCode: 'EUR',
          },
        ],
        expenses: [],
      }),
    ).toThrow(MultiCurrencyInvoiceError)
  })

  it('sets periodStart/periodEnd from min/max of all source dates', () => {
    const r = generateInvoiceLines({
      timeEntries: [
        {
          ...baseTime,
          id: 't1',
          entryDate: '2026-04-27',
          description: 'A',
          hoursText: '1.00',
        },
      ],
      expenses: [
        { ...baseExpense, id: 'e1', entryDate: '2026-04-25', description: 'X', amountCents: 100 },
        { ...baseExpense, id: 'e2', entryDate: '2026-04-30', description: 'Y', amountCents: 100 },
      ],
    })
    expect(r.periodStart).toBe('2026-04-25')
    expect(r.periodEnd).toBe('2026-04-30')
  })

  it('expense lines snapshot description + amount; chartOfAccountsId stays null for journal-time resolution', () => {
    const r = generateInvoiceLines({
      timeEntries: [],
      expenses: [
        { ...baseExpense, id: 'e1', entryDate: '2026-04-27', description: 'Hotel', amountCents: 12500 },
      ],
    })
    const line = r.lines[0]!
    expect(line.kind).toBe('expense')
    expect(line.description).toBe('Hotel')
    expect(line.amountCents).toBe(12500)
    expect(line.unitPriceCents).toBe(12500)
    expect(line.quantityText).toBe('1.00')
    expect(line.chartOfAccountsId).toBeNull() // resolves at journal post via project's BL
    expect(line.sourceExpenseEntryId).toBe('e1')
  })
})
