'use server'

import { and, eq } from 'drizzle-orm'
import { timeEntries, timesheets } from '../schema'
import { defineAction } from '@/lib/actions/define-action'
import { active } from '@/lib/db/active'
import { emitBillingEvent } from '../lib/event-emitter'
import {
  assertTransition,
  type TimesheetStatus,
} from '../lib/timesheets/state-machine'
import {
  approveTimesheetSchema,
  rejectTimesheetSchema,
  reopenTimesheetSchema,
  submitTimesheetSchema,
} from './timesheets-schema'
import type { FinanceTx } from '@/lib/audit/with-audit'

const SOURCE_TABLE = 'billing_timesheets'

async function loadTimesheet(
  tx: FinanceTx,
  organizationId: string,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(timesheets)
    .where(
      and(
        eq(timesheets.id, id),
        eq(timesheets.organizationId, organizationId),
        active(timesheets),
      ),
    )
    .limit(1)
  return row
}

async function cascadeTimeEntries(
  tx: FinanceTx,
  organizationId: string,
  timesheetId: string,
  newStatus: 'submitted' | 'approved' | 'rejected' | 'draft',
): Promise<number> {
  const updated = await tx
    .update(timeEntries)
    .set({ status: newStatus })
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.timesheetId, timesheetId),
        active(timeEntries),
      ),
    )
    .returning({ id: timeEntries.id })
  return updated.length
}

export const submitTimesheet = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: submitTimesheetSchema,
  handler: async (input, ctx) => {
    const before = await loadTimesheet(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Timesheet not found')
    assertTransition(before.status as TimesheetStatus, 'submitted')

    // Validate: at least one active entry; all entries currently 'draft'.
    const entries = await ctx.tx
      .select({ id: timeEntries.id, status: timeEntries.status })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.organizationId, ctx.organizationId),
          eq(timeEntries.timesheetId, before.id),
          active(timeEntries),
        ),
      )
    if (entries.length === 0) {
      throw new Error('Cannot submit an empty timesheet. Log at least one hour first.')
    }

    const cascaded = await cascadeTimeEntries(
      ctx.tx,
      ctx.organizationId,
      before.id,
      'submitted',
    )

    const [row] = await ctx.tx
      .update(timesheets)
      .set({ status: 'submitted', submittedAt: new Date() })
      .where(
        and(
          eq(timesheets.id, before.id),
          eq(timesheets.organizationId, ctx.organizationId),
        ),
      )
      .returning()
    if (!row) throw new Error('Failed to submit timesheet')

    await emitBillingEvent(ctx.tx, 'billing.timesheet.submitted', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Submitted week of ${row.weekStarting} (${cascaded} entries, ${row.totalHours}h)`,
      metadata: {
        weekStarting: row.weekStarting,
        entriesCascaded: cascaded,
        totalHours: row.totalHours,
      },
    })

    return {
      result: { id: row.id, status: row.status, entriesCascaded: cascaded },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const approveTimesheet = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: approveTimesheetSchema,
  handler: async (input, ctx) => {
    const before = await loadTimesheet(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Timesheet not found')
    assertTransition(before.status as TimesheetStatus, 'approved')

    // Phase 1: any user with billing.write can approve their own timesheet.
    // Phase 2 (P2-XX): enforce submitter !== approver + add billing.timesheets.approve permission.

    const cascaded = await cascadeTimeEntries(
      ctx.tx,
      ctx.organizationId,
      before.id,
      'approved',
    )

    const [row] = await ctx.tx
      .update(timesheets)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        approvedByUserId: ctx.userId,
      })
      .where(
        and(
          eq(timesheets.id, before.id),
          eq(timesheets.organizationId, ctx.organizationId),
        ),
      )
      .returning()
    if (!row) throw new Error('Failed to approve timesheet')

    await emitBillingEvent(ctx.tx, 'billing.timesheet.approved', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Approved week of ${row.weekStarting} — ${row.totalHours}h ready to invoice`,
      metadata: {
        weekStarting: row.weekStarting,
        entriesCascaded: cascaded,
        totalHours: row.totalHours,
        notes: input.notes ?? null,
      },
    })

    return {
      result: { id: row.id, status: row.status, entriesCascaded: cascaded },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const rejectTimesheet = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: rejectTimesheetSchema,
  handler: async (input, ctx) => {
    const before = await loadTimesheet(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Timesheet not found')
    assertTransition(before.status as TimesheetStatus, 'rejected')

    const cascaded = await cascadeTimeEntries(
      ctx.tx,
      ctx.organizationId,
      before.id,
      'rejected',
    )

    const [row] = await ctx.tx
      .update(timesheets)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: input.reason,
      })
      .where(
        and(
          eq(timesheets.id, before.id),
          eq(timesheets.organizationId, ctx.organizationId),
        ),
      )
      .returning()
    if (!row) throw new Error('Failed to reject timesheet')

    await emitBillingEvent(ctx.tx, 'billing.timesheet.rejected', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Rejected week of ${row.weekStarting} — ${input.reason}`,
      metadata: {
        weekStarting: row.weekStarting,
        entriesCascaded: cascaded,
        reason: input.reason,
      },
    })

    return {
      result: { id: row.id, status: row.status, entriesCascaded: cascaded },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const reopenTimesheet = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: reopenTimesheetSchema,
  handler: async (input, ctx) => {
    const before = await loadTimesheet(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Timesheet not found')
    assertTransition(before.status as TimesheetStatus, 'draft')

    const cascaded = await cascadeTimeEntries(
      ctx.tx,
      ctx.organizationId,
      before.id,
      'draft',
    )

    const [row] = await ctx.tx
      .update(timesheets)
      .set({
        status: 'draft',
        submittedAt: null,
        approvedAt: null,
        approvedByUserId: null,
        rejectedAt: null,
        rejectionReason: null,
      })
      .where(
        and(
          eq(timesheets.id, before.id),
          eq(timesheets.organizationId, ctx.organizationId),
        ),
      )
      .returning()
    if (!row) throw new Error('Failed to reopen timesheet')

    await emitBillingEvent(ctx.tx, 'billing.timesheet.reopened', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Reopened week of ${row.weekStarting} for editing (${cascaded} entries reset to draft)`,
    })

    return {
      result: { id: row.id, status: row.status, entriesCascaded: cascaded },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})
