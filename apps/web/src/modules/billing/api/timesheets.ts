import { z } from 'zod'
import { aliasedTable, and, asc, desc, eq, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import { projects, timeEntries, timesheets } from '@/modules/billing/schema'
import { businessLines, parties } from '@/modules/parties/schema'
import { users } from '@/modules/auth/schema'
import { active } from '@/lib/db/active'

function getOrgId(ctx: { user: unknown }): string {
  const orgId = (ctx.user as { organizationId?: string }).organizationId
  if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return orgId
}

export const timesheetsRouter = router({
  list: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        status: z
          .enum(['draft', 'submitted', 'approved', 'rejected'])
          .optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const submitter = aliasedTable(parties, 'submitter')

      const wheres = [
        eq(timesheets.organizationId, orgId),
        active(timesheets),
      ]
      if (input.status) wheres.push(eq(timesheets.status, input.status))

      const rows = await db
        .select({
          id: timesheets.id,
          weekStarting: timesheets.weekStarting,
          status: timesheets.status,
          totalHours: timesheets.totalHours,
          submittedByUserId: timesheets.submittedByUserId,
          submitterName: submitter.displayName,
          submittedAt: timesheets.submittedAt,
          approvedAt: timesheets.approvedAt,
          rejectedAt: timesheets.rejectedAt,
          updatedAt: timesheets.updatedAt,
        })
        .from(timesheets)
        .innerJoin(users, eq(users.id, timesheets.submittedByUserId))
        .leftJoin(submitter, eq(submitter.id, users.partyId))
        .where(and(...wheres))
        .orderBy(desc(timesheets.weekStarting))
        .limit(input.limit)
      return rows
    }),

  get: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const submitter = aliasedTable(parties, 'submitter')

      const [sheet] = await db
        .select({
          id: timesheets.id,
          weekStarting: timesheets.weekStarting,
          status: timesheets.status,
          totalHours: timesheets.totalHours,
          submittedByUserId: timesheets.submittedByUserId,
          submitterName: submitter.displayName,
          submittedAt: timesheets.submittedAt,
          approvedAt: timesheets.approvedAt,
          approvedByUserId: timesheets.approvedByUserId,
          rejectedAt: timesheets.rejectedAt,
          rejectionReason: timesheets.rejectionReason,
          createdAt: timesheets.createdAt,
          updatedAt: timesheets.updatedAt,
        })
        .from(timesheets)
        .innerJoin(users, eq(users.id, timesheets.submittedByUserId))
        .leftJoin(submitter, eq(submitter.id, users.partyId))
        .where(
          and(
            eq(timesheets.id, input.id),
            eq(timesheets.organizationId, orgId),
            active(timesheets),
          ),
        )
        .limit(1)
      if (!sheet) throw new TRPCError({ code: 'NOT_FOUND' })

      const entries = await db
        .select({
          id: timeEntries.id,
          projectId: timeEntries.projectId,
          projectName: projects.name,
          businessLineName: businessLines.name,
          entryDate: timeEntries.entryDate,
          hours: timeEntries.hours,
          description: timeEntries.description,
          billableRateCents: timeEntries.billableRateCents,
          currencyCode: timeEntries.currencyCode,
          status: timeEntries.status,
          notes: timeEntries.notes,
        })
        .from(timeEntries)
        .innerJoin(projects, eq(projects.id, timeEntries.projectId))
        .innerJoin(businessLines, eq(businessLines.id, projects.businessLineId))
        .where(
          and(
            eq(timeEntries.organizationId, orgId),
            eq(timeEntries.timesheetId, sheet.id),
            active(timeEntries),
          ),
        )
        .orderBy(asc(timeEntries.entryDate), asc(projects.name))

      return { ...sheet, entries }
    }),

  count: procedureWithAuth({ module: 'billing', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const [row] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(timesheets)
        .where(and(eq(timesheets.organizationId, orgId), active(timesheets)))
      return row?.count ?? 0
    },
  ),
})
