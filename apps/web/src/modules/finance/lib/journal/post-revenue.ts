import { randomUUID } from 'node:crypto'
import { journalEntries, journalLines } from '../../schema'
import { findSystemAccount } from '../system-accounts'
import { nextEntryNumber } from './next-entry-number'
import type { FinanceTx } from '@/lib/audit/with-audit'

export interface PostRevenueJournalOptions {
  organizationId: string
  revenueId: string
  entryDate: string // ISO yyyy-mm-dd
  businessLineId: string
  partyId?: string | null
  /** The credit side — the revenue account the user picked on the form. */
  revenueChartOfAccountsId: string
  amountCents: number
  currencyCode: string
  description: string
  /**
   * Drives which debit account is used:
   *   'received' → cash_operating
   *   'expected' / 'failed' / 'refunded' → ar_default
   */
  paymentStatus: 'expected' | 'received' | 'failed' | 'refunded'
}

export interface PostedJournalEntry {
  id: string
  entryNumber: string
}

/**
 * Posts a 2-line journal entry for a revenue event:
 *   DEBIT  cash_operating (if paymentStatus='received') or ar_default (else)
 *   CREDIT revenue_chart_of_accounts (the row the user picked)
 *
 * Both legs share `amountCents`; entry is balanced by construction.
 *
 * Caller is responsible for setting the resulting journal_entry id on the
 * revenue row's `journal_entry_id` FK (typically by including this id on the
 * revenue insert/update INSIDE the same tx).
 */
export async function postRevenueJournal(
  tx: FinanceTx,
  opts: PostRevenueJournalOptions,
): Promise<PostedJournalEntry> {
  const debitRole =
    opts.paymentStatus === 'received' ? 'cash_operating' : 'ar_default'
  const debitAccountId = await findSystemAccount(tx, opts.organizationId, debitRole)

  const year = Number(opts.entryDate.slice(0, 4))
  const entryNumber = await nextEntryNumber(tx, opts.organizationId, year)
  const entryId = randomUUID()

  await tx.insert(journalEntries).values({
    id: entryId,
    organizationId: opts.organizationId,
    entryDate: opts.entryDate,
    entryNumber,
    description: opts.description,
    sourceTable: 'finance_revenue_entries',
    sourceId: opts.revenueId,
    isReversal: false,
  })

  await tx.insert(journalLines).values([
    {
      organizationId: opts.organizationId,
      journalEntryId: entryId,
      chartOfAccountsId: debitAccountId,
      debitCents: opts.amountCents,
      creditCents: 0,
      currencyCode: opts.currencyCode,
      businessLineId: opts.businessLineId,
      partyId: opts.partyId ?? null,
      lineNumber: 1,
    },
    {
      organizationId: opts.organizationId,
      journalEntryId: entryId,
      chartOfAccountsId: opts.revenueChartOfAccountsId,
      debitCents: 0,
      creditCents: opts.amountCents,
      currencyCode: opts.currencyCode,
      businessLineId: opts.businessLineId,
      partyId: opts.partyId ?? null,
      lineNumber: 2,
    },
  ])

  return { id: entryId, entryNumber }
}
