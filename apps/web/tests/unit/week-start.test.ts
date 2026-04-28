import { describe, expect, it } from 'vitest'
import {
  getWeekDays,
  getWeekStart,
} from '@/modules/billing/lib/timesheets/get-week-start'

describe('getWeekStart (Monday-of-the-week, UTC)', () => {
  it('returns the input date when input IS Monday', () => {
    // 2026-04-27 is a Monday.
    expect(getWeekStart('2026-04-27')).toBe('2026-04-27')
  })

  it('walks back to the prior Monday from a midweek date', () => {
    // 2026-04-29 is a Wednesday → Monday is 2026-04-27.
    expect(getWeekStart('2026-04-29')).toBe('2026-04-27')
    // 2026-05-02 is a Saturday.
    expect(getWeekStart('2026-05-02')).toBe('2026-04-27')
  })

  it('walks back 6 days from a Sunday (Sunday belongs to the prior Monday week)', () => {
    // 2026-05-03 is a Sunday → Monday is 2026-04-27.
    expect(getWeekStart('2026-05-03')).toBe('2026-04-27')
  })

  it('crosses month boundaries', () => {
    // 2026-04-01 is a Wednesday → 2026-03-30 (Monday).
    expect(getWeekStart('2026-04-01')).toBe('2026-03-30')
  })

  it('crosses year boundaries', () => {
    // 2026-01-02 is a Friday → 2025-12-29 (Monday).
    expect(getWeekStart('2026-01-02')).toBe('2025-12-29')
  })

  it('rejects malformed ISO dates', () => {
    expect(() => getWeekStart('2026/04/27')).toThrow(/Invalid ISO/)
    expect(() => getWeekStart('not-a-date')).toThrow(/Invalid ISO/)
  })
})

describe('getWeekDays', () => {
  it('returns 7 consecutive ISO dates Mon → Sun', () => {
    const days = getWeekDays('2026-04-27')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-04-27')
    expect(days[6]).toBe('2026-05-03')
  })

  it('crosses month boundaries cleanly', () => {
    const days = getWeekDays('2026-04-27')
    // April has 30 days, so the week wraps into May.
    expect(days).toContain('2026-04-30')
    expect(days).toContain('2026-05-01')
  })
})
