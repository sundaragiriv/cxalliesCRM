import { z } from 'zod'
import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import { journalEntries, journalLines, taxEstimates } from '@/modules/finance/schema'
import { active } from '@/lib/db/active'
import { getQuarterForDate, todayUtcIso } from '@/modules/finance/lib/tax/quarters'

function getOrgId(ctx: { user: unknown }): string {
  const orgId = (ctx.user as { organizationId?: string }).organizationId
  if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return orgId
}

export const taxEstimatesRouter = router({
  list: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(
      z.object({
        year: z.number().int().min(2000).max(2100).optional(),
        limit: z.number().int().min(1).max(50).default(8),
      }),
    )
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const wheres = [eq(taxEstimates.organizationId, orgId), active(taxEstimates)]
      if (input.year) wheres.push(eq(taxEstimates.taxYear, input.year))

      const rows = await db
        .select({
          id: taxEstimates.id,
          taxYear: taxEstimates.taxYear,
          taxQuarter: taxEstimates.taxQuarter,
          periodStart: taxEstimates.periodStart,
          periodEnd: taxEstimates.periodEnd,
          dueDate: taxEstimates.dueDate,
          grossIncomeCents: taxEstimates.grossIncomeCents,
          deductibleExpensesCents: taxEstimates.deductibleExpensesCents,
          federalEstimateCents: taxEstimates.federalEstimateCents,
          stateEstimateCents: taxEstimates.stateEstimateCents,
          selfEmploymentEstimateCents: taxEstimates.selfEmploymentEstimateCents,
          totalEstimateCents: taxEstimates.totalEstimateCents,
          paidAt: taxEstimates.paidAt,
          paidAmountCents: taxEstimates.paidAmountCents,
          updatedAt: taxEstimates.updatedAt,
        })
        .from(taxEstimates)
        .where(and(...wheres))
        .orderBy(desc(taxEstimates.taxYear), desc(taxEstimates.taxQuarter))
        .limit(input.limit)

      return rows
    }),

  get: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const [row] = await db
        .select()
        .from(taxEstimates)
        .where(
          and(
            eq(taxEstimates.id, input.id),
            eq(taxEstimates.organizationId, orgId),
            active(taxEstimates),
          ),
        )
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return row
    }),

  /**
   * Returns the (year, quarter) info for "today" plus the matching
   * tax_estimates row if one exists. The estimate row is created lazily by
   * the next mutation that touches the period; on first load with no
   * mutations yet, returns `estimate: null`.
   */
  getCurrentQuarter: procedureWithAuth({ module: 'finance', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const q = getQuarterForDate(todayUtcIso())
      const [row] = await db
        .select()
        .from(taxEstimates)
        .where(
          and(
            eq(taxEstimates.organizationId, orgId),
            eq(taxEstimates.taxYear, q.year),
            eq(taxEstimates.taxQuarter, q.quarter),
            active(taxEstimates),
          ),
        )
        .limit(1)
      return { quarter: q, estimate: row ?? null }
    },
  ),

  /** Returns the journal entries posted from this tax estimate (mark-paid). */
  journal: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(z.object({ taxEstimateId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const entries = await db
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.organizationId, orgId),
            eq(journalEntries.sourceTable, 'finance_tax_estimates'),
            eq(journalEntries.sourceId, input.taxEstimateId),
          ),
        )
        .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNumber))

      const lines = entries.length
        ? await db
            .select()
            .from(journalLines)
            .where(
              or(...entries.map((e) => eq(journalLines.journalEntryId, e.id)))!,
            )
            .orderBy(journalLines.journalEntryId, journalLines.lineNumber)
        : []

      return { entries, lines }
    }),

  count: procedureWithAuth({ module: 'finance', action: 'read' }).query(async ({ ctx }) => {
    const orgId = getOrgId(ctx)
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(taxEstimates)
      .where(and(eq(taxEstimates.organizationId, orgId), active(taxEstimates)))
    return row?.count ?? 0
  }),
})
