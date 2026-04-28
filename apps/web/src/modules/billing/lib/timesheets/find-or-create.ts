import { and, eq } from 'drizzle-orm'
import { timesheets } from '../../schema'
import { active } from '@/lib/db/active'
import type { FinanceTx } from '@/lib/audit/with-audit'

export interface FindOrCreateTimesheetOptions {
  organizationId: string
  submittedByUserId: string
  weekStarting: string // ISO yyyy-mm-dd, must be a Monday
}

/**
 * Lazy upsert: returns the existing timesheet for (org, user, week) if one
 * is active, otherwise inserts a new draft row and returns it.
 *
 * Idempotent. Used by createTimeEntry to materialize the timesheet on first
 * hour entry for that week per the P1-12 design — the user never sees a
 * "Start week" button; the timesheet appears in their list once they've
 * logged something.
 */
export async function findOrCreateTimesheet(
  tx: FinanceTx,
  opts: FindOrCreateTimesheetOptions,
): Promise<{ id: string; status: string; created: boolean }> {
  const [existing] = await tx
    .select({ id: timesheets.id, status: timesheets.status })
    .from(timesheets)
    .where(
      and(
        eq(timesheets.organizationId, opts.organizationId),
        eq(timesheets.submittedByUserId, opts.submittedByUserId),
        eq(timesheets.weekStarting, opts.weekStarting),
        active(timesheets),
      ),
    )
    .limit(1)

  if (existing) {
    return { id: existing.id, status: existing.status, created: false }
  }

  const [inserted] = await tx
    .insert(timesheets)
    .values({
      organizationId: opts.organizationId,
      submittedByUserId: opts.submittedByUserId,
      weekStarting: opts.weekStarting,
      status: 'draft',
      totalHours: '0',
    })
    .returning({ id: timesheets.id, status: timesheets.status })

  if (!inserted) throw new Error('Failed to insert timesheet')
  return { id: inserted.id, status: inserted.status, created: true }
}
