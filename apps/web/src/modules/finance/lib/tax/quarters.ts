/**
 * IRS quarterly estimated-tax calendar.
 *
 * Stable per IRS Pub 505 — these dates haven't moved in 30+ years. If a
 * future jurisdiction has different quarter dates, this becomes data
 * (likely a `tax_quarters` reference table keyed by jurisdiction).
 *
 * Quarter coverage is asymmetric by design: Q1=Jan-Mar (3mo), Q2=Apr-May
 * (2mo), Q3=Jun-Aug (3mo), Q4=Sep-Dec (4mo). The due date is the 15th of
 * the month following the period end (Q4 due Jan 15 of the next year).
 */

export interface QuarterInfo {
  year: number
  quarter: 1 | 2 | 3 | 4
  /** ISO date inclusive — first day of the quarter's period. */
  periodStart: string
  /** ISO date inclusive — last day of the quarter's period. */
  periodEnd: string
  /** ISO date — IRS estimated-tax due date for this quarter. */
  dueDate: string
}

const QUARTER_BOUNDARIES: ReadonlyArray<{
  quarter: 1 | 2 | 3 | 4
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
  dueMonth: number
  dueDay: number
  dueYearOffset: 0 | 1
}> = [
  { quarter: 1, startMonth: 1, startDay: 1, endMonth: 3, endDay: 31, dueMonth: 4, dueDay: 15, dueYearOffset: 0 },
  { quarter: 2, startMonth: 4, startDay: 1, endMonth: 5, endDay: 31, dueMonth: 6, dueDay: 15, dueYearOffset: 0 },
  { quarter: 3, startMonth: 6, startDay: 1, endMonth: 8, endDay: 31, dueMonth: 9, dueDay: 15, dueYearOffset: 0 },
  { quarter: 4, startMonth: 9, startDay: 1, endMonth: 12, endDay: 31, dueMonth: 1, dueDay: 15, dueYearOffset: 1 },
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function getQuarterInfo(year: number, quarter: 1 | 2 | 3 | 4): QuarterInfo {
  const b = QUARTER_BOUNDARIES.find((q) => q.quarter === quarter)
  if (!b) throw new Error(`Invalid quarter: ${quarter}`)
  return {
    year,
    quarter,
    periodStart: `${year}-${pad(b.startMonth)}-${pad(b.startDay)}`,
    periodEnd: `${year}-${pad(b.endMonth)}-${pad(b.endDay)}`,
    dueDate: `${year + b.dueYearOffset}-${pad(b.dueMonth)}-${pad(b.dueDay)}`,
  }
}

/**
 * Maps an ISO date (yyyy-mm-dd) to the IRS quarter that contains it.
 * Throws on invalid input. Pure function over the input string.
 */
export function getQuarterForDate(isoDate: string): QuarterInfo {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) throw new Error(`Invalid ISO date: ${isoDate}`)
  const year = Number(m[1])
  const month = Number(m[2])

  let quarter: 1 | 2 | 3 | 4
  if (month <= 3) quarter = 1
  else if (month <= 5) quarter = 2
  else if (month <= 8) quarter = 3
  else quarter = 4

  return getQuarterInfo(year, quarter)
}

/**
 * Returns the four quarters of a tax year in chronological order.
 */
export function getYearQuarters(year: number): readonly QuarterInfo[] {
  return [
    getQuarterInfo(year, 1),
    getQuarterInfo(year, 2),
    getQuarterInfo(year, 3),
    getQuarterInfo(year, 4),
  ]
}

/**
 * UTC "today" as ISO date — used to derive the current quarter on the server.
 */
export function todayUtcIso(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
