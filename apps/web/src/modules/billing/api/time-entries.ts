import { z } from 'zod'
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import { projects, timeEntries, timesheets } from '@/modules/billing/schema'
import { businessLines } from '@/modules/parties/schema'
import { active } from '@/lib/db/active'
import {
  getWeekDays,
  getWeekStart,
} from '@/modules/billing/lib/timesheets/get-week-start'

function getOrgId(ctx: { user: unknown }): string {
  const orgId = (ctx.user as { organizationId?: string }).organizationId
  if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return orgId
}

function getUserId(ctx: { user: unknown }): string {
  const userId = (ctx.user as { id?: string }).id
  if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return userId
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

export const timeEntriesRouter = router({
  /**
   * The grid feed. Given any ISO date in a week, returns:
   *   - week metadata (start, days array, current timesheet status)
   *   - active projects eligible for new entries (status IN planned/active/on_hold)
   *   - all entries for (current user × that week), keyed by (project_id, day)
   *   - lookup map for any "stale" projects that have entries but aren't
   *     in the eligible list (so the grid can still display them as
   *     read-only rows)
   */
  weekGrid: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(z.object({ anyDateInWeek: isoDate.optional() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const userId = getUserId(ctx)
      const today = new Date().toISOString().slice(0, 10)
      const weekStart = getWeekStart(input.anyDateInWeek ?? today)
      const days = getWeekDays(weekStart)
      const weekEnd = days[days.length - 1]!

      // Active project picker (planned/active/on_hold). Excludes completed
      // and canceled. is_active=true filters out admin-disabled rows.
      const eligibleProjects = await db
        .select({
          id: projects.id,
          projectNumber: projects.projectNumber,
          name: projects.name,
          businessLineId: projects.businessLineId,
          businessLineName: businessLines.name,
          status: projects.status,
          defaultBillableRateCents: projects.defaultBillableRateCents,
          currencyCode: projects.currencyCode,
        })
        .from(projects)
        .innerJoin(businessLines, eq(businessLines.id, projects.businessLineId))
        .where(
          and(
            eq(projects.organizationId, orgId),
            active(projects),
            sql`${projects.status} IN ('planned', 'active', 'on_hold')`,
          ),
        )
        .orderBy(asc(businessLines.displayOrder), asc(projects.name))

      // All entries for (user, week).
      const entries = await db
        .select({
          id: timeEntries.id,
          projectId: timeEntries.projectId,
          entryDate: timeEntries.entryDate,
          hours: timeEntries.hours,
          description: timeEntries.description,
          billableRateCents: timeEntries.billableRateCents,
          currencyCode: timeEntries.currencyCode,
          status: timeEntries.status,
          notes: timeEntries.notes,
          timesheetId: timeEntries.timesheetId,
        })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.organizationId, orgId),
            eq(timeEntries.submittedByUserId, userId),
            gte(timeEntries.entryDate, weekStart),
            lte(timeEntries.entryDate, weekEnd),
            active(timeEntries),
          ),
        )

      // Stale-project rows: any project that has an entry but isn't in the
      // eligible picker. UI shows these read-only.
      const eligibleIds = new Set(eligibleProjects.map((p) => p.id))
      const staleProjectIds = Array.from(
        new Set(
          entries
            .map((e) => e.projectId)
            .filter((id) => !eligibleIds.has(id)),
        ),
      )
      const staleProjects = staleProjectIds.length
        ? await db
            .select({
              id: projects.id,
              projectNumber: projects.projectNumber,
              name: projects.name,
              businessLineName: businessLines.name,
              status: projects.status,
              defaultBillableRateCents: projects.defaultBillableRateCents,
              currencyCode: projects.currencyCode,
            })
            .from(projects)
            .innerJoin(
              businessLines,
              eq(businessLines.id, projects.businessLineId),
            )
            .where(
              and(
                eq(projects.organizationId, orgId),
                sql`${projects.id} = ANY(${staleProjectIds}::uuid[])`,
              ),
            )
        : []

      // Current week's timesheet (if exists).
      const [sheet] = await db
        .select({
          id: timesheets.id,
          status: timesheets.status,
          totalHours: timesheets.totalHours,
          weekStarting: timesheets.weekStarting,
          submittedAt: timesheets.submittedAt,
          approvedAt: timesheets.approvedAt,
          rejectedAt: timesheets.rejectedAt,
          rejectionReason: timesheets.rejectionReason,
        })
        .from(timesheets)
        .where(
          and(
            eq(timesheets.organizationId, orgId),
            eq(timesheets.submittedByUserId, userId),
            eq(timesheets.weekStarting, weekStart),
            active(timesheets),
          ),
        )
        .limit(1)

      return {
        weekStart,
        days,
        eligibleProjects,
        staleProjects,
        entries,
        timesheet: sheet ?? null,
      }
    }),

  /** Single entry detail — used by the dialog when editing description/rate/notes outside the grid. */
  get: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const [row] = await db
        .select({
          id: timeEntries.id,
          projectId: timeEntries.projectId,
          projectName: projects.name,
          entryDate: timeEntries.entryDate,
          hours: timeEntries.hours,
          description: timeEntries.description,
          billableRateCents: timeEntries.billableRateCents,
          currencyCode: timeEntries.currencyCode,
          status: timeEntries.status,
          notes: timeEntries.notes,
          timesheetId: timeEntries.timesheetId,
          createdAt: timeEntries.createdAt,
          updatedAt: timeEntries.updatedAt,
        })
        .from(timeEntries)
        .innerJoin(projects, eq(projects.id, timeEntries.projectId))
        .where(
          and(
            eq(timeEntries.id, input.id),
            eq(timeEntries.organizationId, orgId),
            active(timeEntries),
          ),
        )
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return row
    }),

  count: procedureWithAuth({ module: 'billing', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const [row] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(timeEntries)
        .where(and(eq(timeEntries.organizationId, orgId), active(timeEntries)))
      return row?.count ?? 0
    },
  ),
})
