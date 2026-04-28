'use server'

import { and, eq, sql } from 'drizzle-orm'
import { projects, timeEntries, timesheets } from '../schema'
import { defineAction } from '@/lib/actions/define-action'
import { active } from '@/lib/db/active'
import { emitBillingEvent } from '../lib/event-emitter'
import { findOrCreateTimesheet } from '../lib/timesheets/find-or-create'
import { getWeekStart } from '../lib/timesheets/get-week-start'
import { recomputeTimesheetTotalHours } from '../lib/timesheets/recompute-total-hours'
import { canEditEntries, type TimesheetStatus } from '../lib/timesheets/state-machine'
import {
  softDeleteTimeEntrySchema,
  updateTimeEntrySchema,
  upsertTimeEntrySchema,
} from './time-entries-schema'

const SOURCE_TABLE = 'billing_time_entries'

/**
 * Q4 (P1-12) footgun guard — when no rate is available from the project's
 * default and no per-entry override is provided, the action throws with a
 * UI-friendly error. The caller's banner ("Set rate on Project / Override
 * for this entry") makes recovery one click.
 */
class MissingRateError extends Error {
  readonly fieldErrors: Record<string, string>
  constructor() {
    super(
      'No billable rate set on this project. Set a default on the Project, or override the rate for this entry.',
    )
    this.fieldErrors = { billableRateCents: 'Rate required' }
    this.name = 'MissingRateError'
  }
}

/**
 * Per conventions §3.13 — snapshot the project's default rate (or the
 * caller-provided override) at entry creation. Subsequent edits to
 * Project.default_billable_rate_cents do NOT rewrite this row.
 */
async function resolveBillableRateCents(
  tx: Parameters<Parameters<typeof import('@/db/client').db.transaction>[0]>[0],
  organizationId: string,
  projectId: string,
  override: number | null | undefined,
): Promise<{ rateCents: number; currencyCode: string }> {
  const [project] = await tx
    .select({
      defaultBillableRateCents: projects.defaultBillableRateCents,
      currencyCode: projects.currencyCode,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId),
        active(projects),
      ),
    )
    .limit(1)

  if (!project) throw new Error('Project not found in this organization')

  const rateCents = override ?? project.defaultBillableRateCents
  if (rateCents == null) throw new MissingRateError()
  return { rateCents, currencyCode: project.currencyCode }
}

export const upsertTimeEntry = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'insert' },
  schema: upsertTimeEntrySchema,
  handler: async (input, ctx) => {
    // 1. Resolve the rate (project default or per-entry override). Throws
    //    MissingRateError when neither is set.
    const { rateCents, currencyCode } = await resolveBillableRateCents(
      ctx.tx,
      ctx.organizationId,
      input.projectId,
      input.billableRateCents ?? null,
    )

    // 2. Find or lazy-create the timesheet for this (user, week).
    const weekStart = getWeekStart(input.entryDate)
    const sheet = await findOrCreateTimesheet(ctx.tx, {
      organizationId: ctx.organizationId,
      submittedByUserId: ctx.userId,
      weekStarting: weekStart,
    })
    if (!canEditEntries(sheet.status as TimesheetStatus)) {
      throw new Error(
        `Cannot edit time entries while timesheet is '${sheet.status}'. Reopen the timesheet first.`,
      )
    }

    // 3. UPSERT against the partial unique index (org, project, user,
    //    entry_date) WHERE deleted_at IS NULL. On conflict update the
    //    rate snapshot too — but only when the user explicitly passed an
    //    override; otherwise keep the existing snapshot to honor §3.13.
    const updateSet: Record<string, unknown> = {
      hours: input.hours.toFixed(2),
      description: input.description,
      notes: input.notes ?? null,
      timesheetId: sheet.id,
      // Reset status to draft on grid-cell rewrite; if the user cleared
      // hours and re-entered, this is effectively a new entry from a
      // workflow perspective. canEditEntries above already gated on draft.
      status: 'draft',
    }
    if (input.billableRateCents != null) {
      updateSet.billableRateCents = input.billableRateCents
    }

    const [row] = await ctx.tx
      .insert(timeEntries)
      .values({
        organizationId: ctx.organizationId,
        projectId: input.projectId,
        submittedByUserId: ctx.userId,
        entryDate: input.entryDate,
        hours: input.hours.toFixed(2),
        description: input.description,
        billableRateCents: rateCents,
        currencyCode,
        status: 'draft',
        timesheetId: sheet.id,
        notes: input.notes ?? null,
      })
      .onConflictDoUpdate({
        target: [
          timeEntries.organizationId,
          timeEntries.projectId,
          timeEntries.submittedByUserId,
          timeEntries.entryDate,
        ],
        // Match the partial unique index's predicate so Postgres picks
        // the right index. Without this, "no unique or exclusion
        // constraint matching the ON CONFLICT specification."
        targetWhere: sql`${timeEntries.deletedAt} IS NULL`,
        set: updateSet,
      })
      .returning()

    if (!row) throw new Error('Failed to upsert time entry')

    const total = await recomputeTimesheetTotalHours(ctx.tx, sheet.id)

    await emitBillingEvent(ctx.tx, 'billing.timeEntry.created', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Logged ${input.hours.toFixed(2)}h on ${input.entryDate} — ${input.description}`,
      metadata: {
        projectId: input.projectId,
        timesheetId: sheet.id,
        weekStarting: weekStart,
        billableRateCents: rateCents,
      },
    })

    return {
      result: { id: row.id, timesheetId: sheet.id, totalHours: total },
      recordId: row.id,
      after: row as Record<string, unknown>,
    }
  },
})

export const updateTimeEntry = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: updateTimeEntrySchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.id, input.id),
          eq(timeEntries.organizationId, ctx.organizationId),
          active(timeEntries),
        ),
      )
      .limit(1)

    if (!before) throw new Error('Time entry not found')

    // Status check via parent timesheet (status flows through it).
    if (!before.timesheetId) {
      throw new Error('Time entry has no parent timesheet (data integrity error)')
    }
    const [sheet] = await ctx.tx
      .select({ status: timesheets.status })
      .from(timesheets)
      .where(eq(timesheets.id, before.timesheetId))
      .limit(1)
    if (!sheet || !canEditEntries(sheet.status as TimesheetStatus)) {
      throw new Error(
        `Cannot edit time entries while timesheet is '${sheet?.status ?? 'unknown'}'. Reopen the timesheet first.`,
      )
    }

    const [row] = await ctx.tx
      .update(timeEntries)
      .set({
        hours: input.hours.toFixed(2),
        description: input.description,
        billableRateCents: input.billableRateCents,
        notes: input.notes ?? null,
      })
      .where(
        and(
          eq(timeEntries.id, input.id),
          eq(timeEntries.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to update time entry')

    const total = await recomputeTimesheetTotalHours(ctx.tx, before.timesheetId)

    await emitBillingEvent(ctx.tx, 'billing.timeEntry.updated', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Updated ${input.hours.toFixed(2)}h — ${input.description}`,
      metadata: { totalHours: total },
    })

    return {
      result: { id: row.id, totalHours: total },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const softDeleteTimeEntry = defineAction({
  permission: { module: 'billing', action: 'delete' },
  audit: { table: SOURCE_TABLE, action: 'soft_delete' },
  schema: softDeleteTimeEntrySchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.id, input.id),
          eq(timeEntries.organizationId, ctx.organizationId),
          active(timeEntries),
        ),
      )
      .limit(1)

    if (!before) throw new Error('Time entry not found')

    if (!before.timesheetId) {
      throw new Error('Time entry has no parent timesheet (data integrity error)')
    }
    const [sheet] = await ctx.tx
      .select({ status: timesheets.status })
      .from(timesheets)
      .where(eq(timesheets.id, before.timesheetId))
      .limit(1)
    if (!sheet || !canEditEntries(sheet.status as TimesheetStatus)) {
      throw new Error(
        `Cannot delete time entries while timesheet is '${sheet?.status ?? 'unknown'}'.`,
      )
    }

    const [row] = await ctx.tx
      .update(timeEntries)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(timeEntries.id, input.id),
          eq(timeEntries.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to soft-delete time entry')

    const total = await recomputeTimesheetTotalHours(ctx.tx, before.timesheetId)

    await emitBillingEvent(ctx.tx, 'billing.timeEntry.deleted', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Deleted ${Number(before.hours).toFixed(2)}h — ${before.description}`,
      metadata: { totalHours: total },
    })

    return {
      result: { id: row.id, totalHours: total },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})
