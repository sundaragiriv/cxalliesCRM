import { z } from 'zod'
import { and, desc, eq, ilike, lt, gte, lte, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import { expenseEntries, chartOfAccounts } from '@/modules/finance/schema'
import { businessLines, parties } from '@/modules/parties/schema'
import { active } from '@/lib/db/active'

function getOrgId(ctx: { user: unknown }): string {
  const orgId = (ctx.user as { organizationId?: string }).organizationId
  if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return orgId
}

const listFilters = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  businessLineId: z.string().uuid().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isBillable: z.boolean().optional(),
  isReimbursable: z.boolean().optional(),
  search: z.string().trim().max(200).optional(),
})

export const expensesRouter = router({
  list: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(listFilters)
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)

      const wheres = [eq(expenseEntries.organizationId, orgId), active(expenseEntries)]
      if (input.businessLineId) wheres.push(eq(expenseEntries.businessLineId, input.businessLineId))
      if (input.fromDate) wheres.push(gte(expenseEntries.entryDate, input.fromDate))
      if (input.toDate) wheres.push(lte(expenseEntries.entryDate, input.toDate))
      if (input.isBillable !== undefined) wheres.push(eq(expenseEntries.isBillable, input.isBillable))
      if (input.isReimbursable !== undefined) wheres.push(eq(expenseEntries.isReimbursable, input.isReimbursable))

      // Phase 1 search: ILIKE on description + joined party name. Adequate at <10K rows.
      // FTS column lands later when scale demands it.
      if (input.search) {
        const pattern = `%${input.search}%`
        wheres.push(
          or(
            ilike(expenseEntries.description, pattern),
            ilike(parties.displayName, pattern),
            ilike(expenseEntries.notes, pattern),
          )!,
        )
      }

      if (input.cursor) {
        wheres.push(lt(expenseEntries.id, input.cursor))
      }

      const rows = await db
        .select({
          id: expenseEntries.id,
          entryDate: expenseEntries.entryDate,
          description: expenseEntries.description,
          amountCents: expenseEntries.amountCents,
          currencyCode: expenseEntries.currencyCode,
          isBillable: expenseEntries.isBillable,
          isReimbursable: expenseEntries.isReimbursable,
          businessLineId: expenseEntries.businessLineId,
          businessLineSlug: businessLines.slug,
          businessLineName: businessLines.name,
          payeeDisplayName: parties.displayName,
          chartOfAccountsId: expenseEntries.chartOfAccountsId,
          accountName: chartOfAccounts.accountName,
          receiptFileId: expenseEntries.receiptFileId,
        })
        .from(expenseEntries)
        .innerJoin(businessLines, eq(businessLines.id, expenseEntries.businessLineId))
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, expenseEntries.chartOfAccountsId))
        .leftJoin(parties, eq(parties.id, expenseEntries.payeePartyId))
        .where(and(...wheres))
        .orderBy(desc(expenseEntries.entryDate), desc(expenseEntries.id))
        .limit(input.limit + 1)

      const hasMore = rows.length > input.limit
      const items = rows.slice(0, input.limit)
      const nextCursor = hasMore ? items[items.length - 1]?.id : null

      return { items, nextCursor }
    }),

  get: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)

      const [row] = await db
        .select({
          id: expenseEntries.id,
          entryDate: expenseEntries.entryDate,
          description: expenseEntries.description,
          amountCents: expenseEntries.amountCents,
          currencyCode: expenseEntries.currencyCode,
          paymentSource: expenseEntries.paymentSource,
          corporateCardId: expenseEntries.corporateCardId,
          isBillable: expenseEntries.isBillable,
          isReimbursable: expenseEntries.isReimbursable,
          businessLineId: expenseEntries.businessLineId,
          chartOfAccountsId: expenseEntries.chartOfAccountsId,
          payeePartyId: expenseEntries.payeePartyId,
          payeeDisplayName: parties.displayName,
          accountName: chartOfAccounts.accountName,
          businessLineName: businessLines.name,
          receiptFileId: expenseEntries.receiptFileId,
          notes: expenseEntries.notes,
          submittedByUserId: expenseEntries.submittedByUserId,
          createdAt: expenseEntries.createdAt,
          updatedAt: expenseEntries.updatedAt,
        })
        .from(expenseEntries)
        .innerJoin(businessLines, eq(businessLines.id, expenseEntries.businessLineId))
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, expenseEntries.chartOfAccountsId))
        .leftJoin(parties, eq(parties.id, expenseEntries.payeePartyId))
        .where(
          and(
            eq(expenseEntries.id, input.id),
            eq(expenseEntries.organizationId, orgId),
            active(expenseEntries),
          ),
        )
        .limit(1)

      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return row
    }),

  search: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const pattern = `%${input.query}%`

      const rows = await db
        .select({
          id: expenseEntries.id,
          entryDate: expenseEntries.entryDate,
          description: expenseEntries.description,
          amountCents: expenseEntries.amountCents,
        })
        .from(expenseEntries)
        .leftJoin(parties, eq(parties.id, expenseEntries.payeePartyId))
        .where(
          and(
            eq(expenseEntries.organizationId, orgId),
            active(expenseEntries),
            or(
              ilike(expenseEntries.description, pattern),
              ilike(parties.displayName, pattern),
              ilike(expenseEntries.notes, pattern),
            )!,
          ),
        )
        .orderBy(desc(expenseEntries.entryDate))
        .limit(input.limit)

      return rows
    }),

  /** Single-aggregate count for the active expenses (filters not applied). */
  count: procedureWithAuth({ module: 'finance', action: 'read' })
    .query(async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const [row] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(expenseEntries)
        .where(and(eq(expenseEntries.organizationId, orgId), active(expenseEntries)))
      return row?.count ?? 0
    }),
})
