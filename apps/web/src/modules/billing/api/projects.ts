import { z } from 'zod'
import { aliasedTable, and, asc, desc, eq, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import { projects } from '@/modules/billing/schema'
import { businessLines, parties } from '@/modules/parties/schema'
import { active } from '@/lib/db/active'

function getOrgId(ctx: { user: unknown }): string {
  const orgId = (ctx.user as { organizationId?: string }).organizationId
  if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return orgId
}

export const projectsRouter = router({
  list: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        status: z
          .enum(['planned', 'active', 'on_hold', 'completed', 'canceled'])
          .optional(),
        businessLineId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const endClient = aliasedTable(parties, 'end_client')

      const wheres = [eq(projects.organizationId, orgId), active(projects)]
      if (input.status) wheres.push(eq(projects.status, input.status))
      if (input.businessLineId)
        wheres.push(eq(projects.businessLineId, input.businessLineId))

      const rows = await db
        .select({
          id: projects.id,
          projectNumber: projects.projectNumber,
          name: projects.name,
          businessLineId: projects.businessLineId,
          businessLineName: businessLines.name,
          endClientPartyId: projects.endClientPartyId,
          endClientName: endClient.displayName,
          status: projects.status,
          startDate: projects.startDate,
          endDate: projects.endDate,
          defaultBillableRateCents: projects.defaultBillableRateCents,
          currencyCode: projects.currencyCode,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .innerJoin(businessLines, eq(businessLines.id, projects.businessLineId))
        .leftJoin(endClient, eq(endClient.id, projects.endClientPartyId))
        .where(and(...wheres))
        .orderBy(desc(projects.updatedAt))
        .limit(input.limit)

      return rows
    }),

  get: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const endClient = aliasedTable(parties, 'end_client')
      const vendor = aliasedTable(parties, 'vendor')

      const [row] = await db
        .select({
          id: projects.id,
          projectNumber: projects.projectNumber,
          name: projects.name,
          businessLineId: projects.businessLineId,
          businessLineName: businessLines.name,
          contractId: projects.contractId,
          endClientPartyId: projects.endClientPartyId,
          endClientName: endClient.displayName,
          vendorPartyId: projects.vendorPartyId,
          vendorName: vendor.displayName,
          startDate: projects.startDate,
          endDate: projects.endDate,
          status: projects.status,
          defaultBillableRateCents: projects.defaultBillableRateCents,
          currencyCode: projects.currencyCode,
          budgetHours: projects.budgetHours,
          description: projects.description,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .innerJoin(businessLines, eq(businessLines.id, projects.businessLineId))
        .leftJoin(endClient, eq(endClient.id, projects.endClientPartyId))
        .leftJoin(vendor, eq(vendor.id, projects.vendorPartyId))
        .where(
          and(
            eq(projects.id, input.id),
            eq(projects.organizationId, orgId),
            active(projects),
          ),
        )
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return row
    }),

  /** Active+billable picker for invoice generation. Filters status, sorts by name. */
  pickerOptions: procedureWithAuth({ module: 'billing', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const rows = await db
        .select({
          id: projects.id,
          projectNumber: projects.projectNumber,
          name: projects.name,
          businessLineId: projects.businessLineId,
          businessLineName: businessLines.name,
          status: projects.status,
          defaultBillableRateCents: projects.defaultBillableRateCents,
          currencyCode: projects.currencyCode,
          endClientPartyId: projects.endClientPartyId,
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
      return rows
    },
  ),

  count: procedureWithAuth({ module: 'billing', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const [row] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(projects)
        .where(and(eq(projects.organizationId, orgId), active(projects)))
      return row?.count ?? 0
    },
  ),
})
