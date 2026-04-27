import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { journalEntries, journalLines } from '../../schema'
import { nextEntryNumber } from './next-entry-number'
import type { FinanceTx } from '@/lib/audit/with-audit'

export interface ReverseJournalEntryOptions {
  originalEntryId: string
  organizationId: string
  reason: string
  /** Reversal entry_date; defaults to today (UTC). */
  entryDate?: string
}

export interface ReversedJournalEntry {
  id: string
  entryNumber: string
}

/**
 * Posts a reversal of an existing journal entry. The reversal:
 *   - has `is_reversal=true`
 *   - has `reversed_journal_entry_id = original.id`
 *   - copies the original's source_table/source_id (so reports group them)
 *   - inserts mirror journal_lines with debit/credit swapped
 *
 * Net financial effect: zero. Original entry is preserved per data-model §4.2
 * "append-only journals; reversals create new entries".
 */
export async function reverseJournalEntry(
  tx: FinanceTx,
  opts: ReverseJournalEntryOptions,
): Promise<ReversedJournalEntry> {
  const [original] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.id, opts.originalEntryId),
        eq(journalEntries.organizationId, opts.organizationId),
      ),
    )
    .limit(1)

  if (!original) {
    throw new Error(`Original journal entry ${opts.originalEntryId} not found`)
  }

  const lines = await tx
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, opts.originalEntryId))

  const entryDate = opts.entryDate ?? new Date().toISOString().slice(0, 10)
  const year = Number(entryDate.slice(0, 4))
  const entryNumber = await nextEntryNumber(tx, opts.organizationId, year)
  const reversalId = randomUUID()

  await tx.insert(journalEntries).values({
    id: reversalId,
    organizationId: original.organizationId,
    entryDate,
    entryNumber,
    description: `Reversal of ${original.entryNumber} — ${opts.reason}`,
    sourceTable: original.sourceTable,
    sourceId: original.sourceId,
    isReversal: true,
    reversedJournalEntryId: original.id,
  })

  if (lines.length > 0) {
    await tx.insert(journalLines).values(
      lines.map((line) => ({
        organizationId: line.organizationId,
        journalEntryId: reversalId,
        chartOfAccountsId: line.chartOfAccountsId,
        // Swap legs.
        debitCents: line.creditCents,
        creditCents: line.debitCents,
        currencyCode: line.currencyCode,
        description: line.description,
        businessLineId: line.businessLineId,
        partyId: line.partyId,
        lineNumber: line.lineNumber,
      })),
    )
  }

  return { id: reversalId, entryNumber }
}
