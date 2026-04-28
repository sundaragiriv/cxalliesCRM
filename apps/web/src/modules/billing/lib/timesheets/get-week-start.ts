/**
 * Returns the Monday-of-the-week ISO date for a given ISO date, in UTC.
 *
 * Phase 1: UTC-only. Timezone selection deferred until org timezone wiring.
 * If you logged a Sunday-evening time entry on the East Coast and the UTC
 * conversion lands on the next Monday, that's the week the entry rolls into;
 * Phase 5 timezone-aware mode revisits the boundary semantics.
 *
 * Pure function, deterministic.
 */
export function getWeekStart(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) throw new Error(`Invalid ISO date: ${isoDate}`)
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  // UTC date — getUTCDay returns 0 (Sun) ... 6 (Sat). Monday = 1.
  const d = new Date(Date.UTC(year, month - 1, day))
  const dayOfWeek = d.getUTCDay()
  // Distance back to Monday (0 if already Monday). Sunday goes back 6 days.
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  d.setUTCDate(d.getUTCDate() - daysFromMonday)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Returns ISO dates for all 7 days of the week starting at `weekStart`
 * (Mon → Sun), in chronological order.
 */
export function getWeekDays(weekStart: string): readonly string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart)
  if (!m) throw new Error(`Invalid ISO date: ${weekStart}`)
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    days.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    )
  }
  return days
}
