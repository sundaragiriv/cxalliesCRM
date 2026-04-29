import { and, desc, eq, like } from 'drizzle-orm'
import { projects } from '../../schema'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Generates the next sequential project number for the org in the given year.
 * Format: PRJ-YYYY-NNNN (per conventions §3.12).
 *
 * Phase 1: MAX+1 inside the caller's transaction. Race-prone in concurrent
 * contention; single-user Phase 1 makes the window theoretical. Same Phase 2
 * fix as nextEntryNumber/nextReportNumber.
 */
export async function nextProjectNumber(
  tx: FinanceTx,
  organizationId: string,
  year: number,
): Promise<string> {
  const prefix = `PRJ-${year}-`

  const [row] = await tx
    .select({ projectNumber: projects.projectNumber })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        like(projects.projectNumber, `${prefix}%`),
      ),
    )
    .orderBy(desc(projects.projectNumber))
    .limit(1)

  let nextSeq = 1
  if (row?.projectNumber) {
    const parts = row.projectNumber.split('-')
    const last = Number(parts[parts.length - 1])
    if (Number.isFinite(last)) nextSeq = last + 1
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}
