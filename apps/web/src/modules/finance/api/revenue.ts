import { z } from 'zod'
import { and, desc, eq, gte, ilike, lt, lte, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import {
  revenueEntries,
  chartOfAccounts,
  journalEntries,
  journalLines,
} from '../schema'
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
  paymentStatus: z.enum(['expected', 'received', 'failed', 'refunded']).optional(),
  search: z.string().trim().max(200).optional(),
})

export const revenueRouter = router({
  list: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(listFilters)
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const wheres = [eq(revenueEntries.organizationId, orgId), active(revenueEntries)]
      if (input.businessLineId) wheres.push(eq(revenueEntries.businessLineId, input.businessLineId))
      if (input.fromDate) wheres.push(gte(revenueEntries.entryDate, input.fromDate))
      if (input.toDate) wheres.push(lte(revenueEntries.entryDate, input.toDate))
      if (input.paymentStatus) wheres.push(eq(revenueEntries.paymentStatus, input.paymentStatus))

      if (input.search) {
        const pattern = `%${input.search}%`
        wheres.push(
          or(
            ilike(revenueEntries.description, pattern),
            ilike(parties.displayName, pattern),
            ilike(revenueEntries.notes, pattern),
          )!,
        )
      }

      if (input.cursor) wheres.push(lt(revenueEntries.id, input.cursor))

      const rows = await db
        .select({
          id: revenueEntries.id,
          entryDate: revenueEntries.entryDate,
          description: revenueEntries.description,
          amountCents: revenueEntries.amountCents,
          currencyCode: revenueEntries.currencyCode,
          paymentStatus: revenueEntries.paymentStatus,
          paymentMethod: revenueEntries.paymentMethod,
          businessLineId: revenueEntries.businessLineId,
          businessLineName: businessLines.name,
          partyId: revenueEntries.partyId,
          payerDisplayName: parties.displayName,
          chartOfAccountsId: revenueEntries.chartOfAccountsId,
          accountName: chartOfAccounts.accountName,
          journalEntryId: revenueEntries.journalEntryId,
        })
        .from(revenueEntries)
        .innerJoin(businessLines, eq(businessLines.id, revenueEntries.businessLineId))
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, revenueEntries.chartOfAccountsId))
        .leftJoin(parties, eq(parties.id, revenueEntries.partyId))
        .where(and(...wheres))
        .orderBy(desc(revenueEntries.entryDate), desc(revenueEntries.id))
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
          id: revenueEntries.id,
          entryDate: revenueEntries.entryDate,
          description: revenueEntries.description,
          amountCents: revenueEntries.amountCents,
          currencyCode: revenueEntries.currencyCode,
          paymentStatus: revenueEntries.paymentStatus,
          paymentMethod: revenueEntries.paymentMethod,
          businessLineId: revenueEntries.businessLineId,
          businessLineName: businessLines.name,
          partyId: revenueEntries.partyId,
          payerDisplayName: parties.displayName,
          chartOfAccountsId: revenueEntries.chartOfAccountsId,
          accountName: chartOfAccounts.accountName,
          accountNumber: chartOfAccounts.accountNumber,
          journalEntryId: revenueEntries.journalEntryId,
          journalEntryNumber: journalEntries.entryNumber,
          receivedAt: revenueEntries.receivedAt,
          notes: revenueEntries.notes,
          createdAt: revenueEntries.createdAt,
          updatedAt: revenueEntries.updatedAt,
        })
        .from(revenueEntries)
        .innerJoin(businessLines, eq(businessLines.id, revenueEntries.businessLineId))
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, revenueEntries.chartOfAccountsId))
        .leftJoin(parties, eq(parties.id, revenueEntries.partyId))
        .leftJoin(journalEntries, eq(journalEntries.id, revenueEntries.journalEntryId))
        .where(
          and(
            eq(revenueEntries.id, input.id),
            eq(revenueEntries.organizationId, orgId),
            active(revenueEntries),
          ),
        )
        .limit(1)

      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return row
    }),

  /** Returns the journal entry + lines linked to a revenue row, for the detail UI. */
  journal: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(z.object({ revenueId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      // All journal entries that source from this revenue (includes reversals).
      const entries = await db
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.organizationId, orgId),
            eq(journalEntries.sourceTable, 'finance_revenue_entries'),
            eq(journalEntries.sourceId, input.revenueId),
          ),
        )
        .orderBy(journalEntries.entryDate, journalEntries.entryNumber)

      const lines = entries.length
        ? await db
            .select()
            .from(journalLines)
            .where(
              or(
                ...entries.map((e) => eq(journalLines.journalEntryId, e.id)),
              )!,
            )
            .orderBy(journalLines.journalEntryId, journalLines.lineNumber)
        : []

      return { entries, lines }
    }),

  count: procedureWithAuth({ module: 'finance', action: 'read' }).query(async ({ ctx }) => {
    const orgId = getOrgId(ctx)
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(revenueEntries)
      .where(and(eq(revenueEntries.organizationId, orgId), active(revenueEntries)))
    return row?.count ?? 0
  }),
})
