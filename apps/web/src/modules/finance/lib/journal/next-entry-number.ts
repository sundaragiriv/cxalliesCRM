import { and, desc, eq, like } from 'drizzle-orm'
import { journalEntries } from '../../schema'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Generates the next sequential entry number for the org in the given year.
 * Format: JE-YYYY-NNNN.
 *
 * Phase 1: MAX+1 inside the caller's transaction. Race-prone in concurrent
 * contention; single-user Phase 1 makes the window theoretical. Phase 2
 * multi-user upgrade: a `journal_entry_counters` table with
 * `INSERT ... ON CONFLICT DO UPDATE SET seq = seq + 1 RETURNING seq`.
 */
export async function nextEntryNumber(
  tx: FinanceTx,
  organizationId: string,
  year: number,
): Promise<string> {
  const prefix = `JE-${year}-`

  const [row] = await tx
    .select({ entryNumber: journalEntries.entryNumber })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.organizationId, organizationId),
        like(journalEntries.entryNumber, `${prefix}%`),
      ),
    )
    .orderBy(desc(journalEntries.entryNumber))
    .limit(1)

  let nextSeq = 1
  if (row?.entryNumber) {
    const parts = row.entryNumber.split('-')
    const last = Number(parts[parts.length - 1])
    if (Number.isFinite(last)) nextSeq = last + 1
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}
