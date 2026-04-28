import { and, between, eq, isNotNull, sql } from 'drizzle-orm'
import {
  expenseEntries,
  revenueEntries,
  taxEstimates,
  taxRates,
} from '../../schema'
import { organizations } from '@/modules/parties/schema'
import { active } from '@/lib/db/active'
import { compute, type FilingStatus, type TaxRateRow } from './calculator'
import { getQuarterForDate, getQuarterInfo, type QuarterInfo } from './quarters'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * When pg-boss lands (Phase 5), this helper becomes a job-enqueue body swap.
 * Same pattern as the inline-activity-emit-now → bus-later approach from P1-07.
 *
 * Pure-ish: reads org + quarter rates + cash-basis aggregates, computes the
 * estimate, upserts tax_estimates. No journal posting (that's mark-paid only).
 */

async function loadOrgTaxContext(
  tx: FinanceTx,
  organizationId: string,
): Promise<{ filingStatus: FilingStatus; stateCode: string }> {
  const [row] = await tx
    .select({
      defaultFilingStatus: organizations.defaultFilingStatus,
      homeState: organizations.homeState,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1)
  if (!row) {
    throw new Error(`Organization ${organizationId} not found`)
  }
  return {
    filingStatus: (row.defaultFilingStatus ?? 'single') as FilingStatus,
    stateCode: row.homeState,
  }
}

async function loadRatesForYear(
  tx: FinanceTx,
  year: number,
): Promise<TaxRateRow[]> {
  const rows = await tx
    .select({
      taxKind: taxRates.taxKind,
      jurisdiction: taxRates.jurisdiction,
      filingStatus: taxRates.filingStatus,
      bracketLowCents: taxRates.bracketLowCents,
      bracketHighCents: taxRates.bracketHighCents,
      rateBasisPoints: taxRates.rateBasisPoints,
    })
    .from(taxRates)
    .where(eq(taxRates.effectiveYear, year))
  return rows.map((r) => ({
    taxKind: r.taxKind as TaxRateRow['taxKind'],
    jurisdiction: r.jurisdiction,
    filingStatus: r.filingStatus as FilingStatus | null,
    bracketLowCents: r.bracketLowCents,
    bracketHighCents: r.bracketHighCents,
    rateBasisPoints: r.rateBasisPoints,
  }))
}

async function sumQuarterIncome(
  tx: FinanceTx,
  organizationId: string,
  q: QuarterInfo,
): Promise<number> {
  // Cash basis: revenue with paymentStatus='received' AND received_at in
  // [periodStart, periodEnd]. The schema's received_at is timestamptz; we
  // compare against the date boundary by date_trunc / date cast.
  const [row] = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${revenueEntries.amountCents}), 0)::text`,
    })
    .from(revenueEntries)
    .where(
      and(
        eq(revenueEntries.organizationId, organizationId),
        active(revenueEntries),
        eq(revenueEntries.paymentStatus, 'received'),
        isNotNull(revenueEntries.receivedAt),
        between(
          sql`(${revenueEntries.receivedAt})::date`,
          sql`${q.periodStart}::date`,
          sql`${q.periodEnd}::date`,
        ),
      ),
    )
  return Number(row?.total ?? 0)
}

async function sumQuarterExpenses(
  tx: FinanceTx,
  organizationId: string,
  q: QuarterInfo,
): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${expenseEntries.amountCents}), 0)::text`,
    })
    .from(expenseEntries)
    .where(
      and(
        eq(expenseEntries.organizationId, organizationId),
        active(expenseEntries),
        between(expenseEntries.entryDate, q.periodStart, q.periodEnd),
      ),
    )
  return Number(row?.total ?? 0)
}

export interface RecomputeResult {
  taxEstimateId: string
  year: number
  quarter: number
  totalEstimateCents: number
  inserted: boolean
}

/**
 * Recomputes the tax_estimates row for a single (year, quarter). UPSERT on
 * the existing unique index `(organization_id, tax_year, tax_quarter)`.
 * Atomic with the caller's tx.
 *
 * If a row exists and is already paid (`paid_at IS NOT NULL`), the estimate
 * fields are still recomputed but `paid_at` and `paid_amount_cents` are
 * preserved — the user already locked in the actual amount.
 */
export async function recomputeTaxEstimateForPeriod(
  tx: FinanceTx,
  organizationId: string,
  year: number,
  quarter: 1 | 2 | 3 | 4,
): Promise<RecomputeResult> {
  const q = getQuarterInfo(year, quarter)
  const [{ filingStatus, stateCode }, rates, grossIncomeCents, deductibleCents] =
    await Promise.all([
      loadOrgTaxContext(tx, organizationId),
      loadRatesForYear(tx, year),
      sumQuarterIncome(tx, organizationId, q),
      sumQuarterExpenses(tx, organizationId, q),
    ])

  const result = compute({
    grossIncomeCents,
    deductibleExpensesCents: deductibleCents,
    filingStatus,
    stateCode,
    rates,
  })

  // UPSERT — preserve paid_at + paid_amount_cents on conflict (user already
  // locked the actual amount; we don't want auto-recompute to overwrite it).
  const inserted = await tx
    .insert(taxEstimates)
    .values({
      organizationId,
      taxYear: year,
      taxQuarter: quarter,
      periodStart: q.periodStart,
      periodEnd: q.periodEnd,
      grossIncomeCents,
      deductibleExpensesCents: deductibleCents,
      taxableIncomeCents: result.federalTaxableIncomeCents,
      federalEstimateCents: result.federalEstimateCents,
      stateEstimateCents: result.stateEstimateCents,
      selfEmploymentEstimateCents: result.selfEmploymentEstimateCents,
      totalEstimateCents: result.totalEstimateCents,
      dueDate: q.dueDate,
    })
    .onConflictDoUpdate({
      target: [
        taxEstimates.organizationId,
        taxEstimates.taxYear,
        taxEstimates.taxQuarter,
      ],
      set: {
        grossIncomeCents,
        deductibleExpensesCents: deductibleCents,
        taxableIncomeCents: result.federalTaxableIncomeCents,
        federalEstimateCents: result.federalEstimateCents,
        stateEstimateCents: result.stateEstimateCents,
        selfEmploymentEstimateCents: result.selfEmploymentEstimateCents,
        totalEstimateCents: result.totalEstimateCents,
        dueDate: q.dueDate,
      },
    })
    .returning({ id: taxEstimates.id })

  if (!inserted[0]) throw new Error('Failed to upsert tax estimate')

  return {
    taxEstimateId: inserted[0].id,
    year,
    quarter,
    totalEstimateCents: result.totalEstimateCents,
    inserted: true,
  }
}

/**
 * Convenience: derive (year, quarter) from a date and recompute that quarter.
 * Used by the wire-in points in revenue/expense/report actions.
 */
export async function recomputeTaxEstimateForDate(
  tx: FinanceTx,
  organizationId: string,
  isoDate: string,
): Promise<RecomputeResult> {
  const q = getQuarterForDate(isoDate)
  return recomputeTaxEstimateForPeriod(tx, organizationId, q.year, q.quarter)
}

/**
 * Update flows often touch two quarters (old date → new date). This helper
 * recomputes both, deduping when they share a quarter.
 */
export async function recomputeTaxEstimateForDateChange(
  tx: FinanceTx,
  organizationId: string,
  oldIsoDate: string | null,
  newIsoDate: string | null,
): Promise<void> {
  const seen = new Set<string>()
  for (const date of [oldIsoDate, newIsoDate]) {
    if (!date) continue
    const q = getQuarterForDate(date)
    const key = `${q.year}-${q.quarter}`
    if (seen.has(key)) continue
    seen.add(key)
    await recomputeTaxEstimateForPeriod(tx, organizationId, q.year, q.quarter)
  }
}
