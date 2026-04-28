import { describe, it, expect } from 'vitest'
import {
  getQuarterForDate,
  getQuarterInfo,
  getYearQuarters,
} from '@/modules/finance/lib/tax/quarters'

describe('IRS quarter helper', () => {
  it('maps each month to the correct IRS quarter', () => {
    expect(getQuarterForDate('2026-01-15').quarter).toBe(1)
    expect(getQuarterForDate('2026-03-31').quarter).toBe(1)
    expect(getQuarterForDate('2026-04-01').quarter).toBe(2)
    expect(getQuarterForDate('2026-05-31').quarter).toBe(2)
    expect(getQuarterForDate('2026-06-01').quarter).toBe(3)
    expect(getQuarterForDate('2026-08-31').quarter).toBe(3)
    expect(getQuarterForDate('2026-09-01').quarter).toBe(4)
    expect(getQuarterForDate('2026-12-31').quarter).toBe(4)
  })

  it('uses correct period boundaries for each quarter', () => {
    expect(getQuarterInfo(2026, 1)).toMatchObject({
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      dueDate: '2026-04-15',
    })
    expect(getQuarterInfo(2026, 2)).toMatchObject({
      periodStart: '2026-04-01',
      periodEnd: '2026-05-31',
      dueDate: '2026-06-15',
    })
    expect(getQuarterInfo(2026, 3)).toMatchObject({
      periodStart: '2026-06-01',
      periodEnd: '2026-08-31',
      dueDate: '2026-09-15',
    })
    expect(getQuarterInfo(2026, 4)).toMatchObject({
      periodStart: '2026-09-01',
      periodEnd: '2026-12-31',
      // Q4 due in JANUARY of NEXT year — the off-by-one IRS gotcha.
      dueDate: '2027-01-15',
    })
  })

  it('returns 4 quarters in chronological order from getYearQuarters', () => {
    const qs = getYearQuarters(2026)
    expect(qs).toHaveLength(4)
    expect(qs.map((q) => q.quarter)).toEqual([1, 2, 3, 4])
  })

  it('rejects malformed ISO dates', () => {
    expect(() => getQuarterForDate('2026/01/15')).toThrow(/Invalid ISO/)
    expect(() => getQuarterForDate('not-a-date')).toThrow(/Invalid ISO/)
  })
})
