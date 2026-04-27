import { aliasedTable, and, asc, eq, isNull, sql } from 'drizzle-orm'
import { journalEntries } from '../../schema'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Find all journal entries for a given (source_table, source_id) that are:
 *   - not themselves reversals (is_reversal = false), and
 *   - not yet reversed by any other entry.
 *
 * "Reversed by another entry" = there exists another row with
 * reversed_journal_entry_id = this.id.
 *
 * Returns rows in entry_date ASC (oldest first), then id ASC. Caller iterates
 * and calls reverseJournalEntry for each — produces N reversal entries.
 *
 * Used by:
 *   - rejectExpenseReport (from 'approved' state) → reverses the approval entry
 *   - softDeleteExpenseReport (from 'reimbursed' state) → reverses both
 *     approval + reimbursement entries
 */
export async function findUnreversedJournalEntries(
  tx: FinanceTx,
  organizationId: string,
  sourceTable: string,
  sourceId: string,
): Promise<{ id: string; entryNumber: string }[]> {
  const reversers = aliasedTable(journalEntries, 'reversers')

  const rows = await tx
    .select({
      id: journalEntries.id,
      entryNumber: journalEntries.entryNumber,
    })
    .from(journalEntries)
    .leftJoin(reversers, eq(reversers.reversedJournalEntryId, journalEntries.id))
    .where(
      and(
        eq(journalEntries.organizationId, organizationId),
        eq(journalEntries.sourceTable, sourceTable),
        eq(journalEntries.sourceId, sourceId),
        eq(journalEntries.isReversal, false),
        isNull(reversers.id),
      ),
    )
    .orderBy(asc(journalEntries.entryDate), asc(sql`${journalEntries.entryNumber}`))

  return rows
}
