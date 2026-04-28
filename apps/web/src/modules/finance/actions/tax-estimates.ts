'use server'

import { and, eq } from 'drizzle-orm'
import { taxEstimates } from '../schema'
import { defineAction } from '@/lib/actions/define-action'
import { active } from '@/lib/db/active'
import { activities } from '@/db/shared-tables'
import { formatMoney } from '../lib/format-money'
import { postTaxPaymentJournal } from '../lib/journal/post-tax-payment'
import { recomputeTaxEstimateForPeriod } from '../lib/tax/recompute'
import {
  markTaxEstimatePaidSchema,
  recomputeTaxEstimatesSchema,
} from './tax-estimates-schema'

const SOURCE_TABLE = 'finance_tax_estimates'

export const markTaxEstimatePaid = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: markTaxEstimatePaidSchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(taxEstimates)
      .where(
        and(
          eq(taxEstimates.id, input.id),
          eq(taxEstimates.organizationId, ctx.organizationId),
          active(taxEstimates),
        ),
      )
      .limit(1)

    if (!before) throw new Error('Tax estimate not found')
    if (before.paidAt) {
      throw new Error('Tax estimate already marked paid')
    }

    const totalPaid = input.federalCents + input.stateCents + input.seCents

    const journal = await postTaxPaymentJournal(ctx.tx, {
      organizationId: ctx.organizationId,
      taxEstimateId: before.id,
      entryDate: input.paidOn,
      federalCents: input.federalCents,
      stateCents: input.stateCents,
      seCents: input.seCents,
      paymentReference: input.reference,
      taxYear: before.taxYear,
      taxQuarter: before.taxQuarter,
    })

    const [row] = await ctx.tx
      .update(taxEstimates)
      .set({
        paidAt: new Date(input.paidOn),
        paidAmountCents: totalPaid,
        notes: input.notes ?? before.notes ?? null,
      })
      .where(
        and(
          eq(taxEstimates.id, before.id),
          eq(taxEstimates.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to mark tax estimate paid')

    await ctx.tx.insert(activities).values({
      organizationId: ctx.organizationId,
      kind: 'finance.taxEstimate.paid',
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      actorUserId: ctx.userId,
      summary: `Paid ${row.taxYear} Q${row.taxQuarter} taxes — ${formatMoney(totalPaid)} (${input.reference})`,
      metadata: {
        federalCents: input.federalCents,
        stateCents: input.stateCents,
        seCents: input.seCents,
        totalCents: totalPaid,
        reference: input.reference,
        journalEntryNumber: journal.entryNumber,
      },
    })

    return {
      result: {
        id: row.id,
        journalEntryNumber: journal.entryNumber,
        totalCents: totalPaid,
      },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

/**
 * Manually recompute all 4 quarters of a tax year. The auto-recompute on
 * mutations covers the impacted quarter; this is a "force refresh all"
 * escape hatch for the UI button and for recovering after data fixes.
 */
export const recomputeTaxEstimates = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: recomputeTaxEstimatesSchema,
  handler: async (input, ctx) => {
    const results = []
    for (const quarter of [1, 2, 3, 4] as const) {
      const r = await recomputeTaxEstimateForPeriod(
        ctx.tx,
        ctx.organizationId,
        input.year,
        quarter,
      )
      results.push(r)
    }
    return {
      result: {
        year: input.year,
        recomputed: results.map((r) => ({
          quarter: r.quarter,
          totalEstimateCents: r.totalEstimateCents,
        })),
      },
      // No single recordId for a multi-row recompute; pick the first as
      // anchor for the audit row.
      recordId: results[0]!.taxEstimateId,
    }
  },
})
