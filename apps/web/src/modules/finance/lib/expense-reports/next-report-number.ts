import { and, desc, eq, like } from 'drizzle-orm'
import { expenseReports } from '../../schema'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Generates the next sequential report number for the org in the given year.
 * Format: EXP-YYYY-NNNN (per conventions §3.12).
 *
 * Phase 1: MAX+1 inside the caller's transaction. Race-prone in concurrent
 * contention; single-user Phase 1 makes the window theoretical. Same Phase 2
 * fix as nextEntryNumber (counters table or retry-on-unique-violation).
 */
export async function nextReportNumber(
  tx: FinanceTx,
  organizationId: string,
  year: number,
): Promise<string> {
  const prefix = `EXP-${year}-`

  const [row] = await tx
    .select({ reportNumber: expenseReports.reportNumber })
    .from(expenseReports)
    .where(
      and(
        eq(expenseReports.organizationId, organizationId),
        like(expenseReports.reportNumber, `${prefix}%`),
      ),
    )
    .orderBy(desc(expenseReports.reportNumber))
    .limit(1)

  let nextSeq = 1
  if (row?.reportNumber) {
    const parts = row.reportNumber.split('-')
    const last = Number(parts[parts.length - 1])
    if (Number.isFinite(last)) nextSeq = last + 1
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}
