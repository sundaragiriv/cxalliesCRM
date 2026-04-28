import { and, eq, sql } from 'drizzle-orm'
import { timeEntries, timesheets } from '../../schema'
import { active } from '@/lib/db/active'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Recompute and persist the timesheet's denormalized totalHours from the
 * sum of its active time_entries. Atomic with the caller's tx.
 *
 * Returns the new total as a number. Hours are stored as numeric(7,2);
 * we read as text and Number() it.
 */
export async function recomputeTimesheetTotalHours(
  tx: FinanceTx,
  timesheetId: string,
): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${timeEntries.hours}), 0)::text`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.timesheetId, timesheetId),
        active(timeEntries),
      ),
    )

  const total = Number(row?.total ?? 0)
  await tx
    .update(timesheets)
    .set({ totalHours: total.toFixed(2) })
    .where(eq(timesheets.id, timesheetId))
  return total
}
