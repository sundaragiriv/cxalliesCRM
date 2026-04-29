import { randomUUID } from 'node:crypto'
import { journalEntries, journalLines } from '../../schema'
import { findSystemAccount } from '../system-accounts'
import { findRevenueAccountForBusinessLine } from '../revenue-accounts'
import { nextEntryNumber } from './next-entry-number'
import type { FinanceTx } from '@/lib/audit/with-audit'

export interface InvoiceLineForJournal {
  id: string
  amountCents: number
  /**
   * Per-line revenue account override. NULL → resolve via project's BL using
   * findRevenueAccountForBusinessLine. Required (NOT NULL) for manual lines
   * that have no project_id (action layer enforces this).
   */
  chartOfAccountsId: string | null
  /** When set, used to look up the BL → revenue account if chartOfAccountsId is NULL. */
  projectBusinessLineId: string | null
  description: string
}

export interface PostInvoiceJournalOptions {
  organizationId: string
  invoiceId: string
  invoiceNumber: string
  /** Recognition date — typically the invoice's sent_at (UTC date). */
  entryDate: string
  /** Total amount; equals SUM(line.amountCents). Asserted to balance with credits. */
  totalCents: number
  currencyCode: string
  /** Bill-to party — carried on the AR debit line for filtering reports by customer. */
  billToPartyId: string
  /** Invoice-level BL — used as fallback for the AR debit line when lines disagree. */
  invoiceBusinessLineId: string
  lines: ReadonlyArray<InvoiceLineForJournal>
}

export interface PostedJournalEntry {
  id: string
  entryNumber: string
  totalCents: number
}

/**
 * Posts the multi-line invoice journal entry on `sendInvoice`:
 *
 *   DEBIT  AR (system_role='ar_default')             totalCents
 *   CREDIT revenue_account (per resolved CoA)         per-line, grouped by chart_of_accounts_id
 *
 * Per-line revenue account resolution:
 *   1. line.chartOfAccountsId (user override) if set
 *   2. else findRevenueAccountForBusinessLine(tx, org, line.projectBusinessLineId)
 *   3. else throw MissingRevenueAccountError (only fires when both are NULL —
 *      meaning a manual line that the action layer should have caught)
 *
 * Lines that share the same resolved revenue account are SUMMED into one
 * credit row, keeping the journal compact for the common single-account case.
 *
 * Source: finance_journal_entries.source_table='billing_invoices',
 *         source_id = invoice.id
 *
 * Reverse via reverseJournalEntry on void.
 */
export async function postInvoiceJournal(
  tx: FinanceTx,
  opts: PostInvoiceJournalOptions,
): Promise<PostedJournalEntry> {
  if (opts.lines.length === 0) {
    throw new Error('Cannot post invoice journal: no lines')
  }
  if (opts.totalCents <= 0) {
    throw new Error('Cannot post invoice journal: total must be > 0')
  }

  // Resolve every line's revenue account, then group + sum.
  const revenueByAccount = new Map<string, number>()
  for (const line of opts.lines) {
    let acctId = line.chartOfAccountsId
    if (!acctId) {
      if (!line.projectBusinessLineId) {
        throw new Error(
          `Invoice line ${line.id}: missing chart_of_accounts_id and no project_id to resolve from. Manual lines must specify a revenue account.`,
        )
      }
      acctId = await findRevenueAccountForBusinessLine(
        tx,
        opts.organizationId,
        line.projectBusinessLineId,
      )
    }
    revenueByAccount.set(
      acctId,
      (revenueByAccount.get(acctId) ?? 0) + line.amountCents,
    )
  }

  const arAccountId = await findSystemAccount(
    tx,
    opts.organizationId,
    'ar_default',
  )

  const year = Number(opts.entryDate.slice(0, 4))
  const entryNumber = await nextEntryNumber(tx, opts.organizationId, year)
  const entryId = randomUUID()

  // Sanity: sum of credits must equal totalCents.
  const credits = Array.from(revenueByAccount.values()).reduce(
    (s, v) => s + v,
    0,
  )
  if (credits !== opts.totalCents) {
    throw new Error(
      `Invoice journal balance mismatch: lines sum=${credits} != total=${opts.totalCents}`,
    )
  }

  await tx.insert(journalEntries).values({
    id: entryId,
    organizationId: opts.organizationId,
    entryDate: opts.entryDate,
    entryNumber,
    description: `Invoice ${opts.invoiceNumber} sent`,
    sourceTable: 'billing_invoices',
    sourceId: opts.invoiceId,
    isReversal: false,
  })

  // 1 debit AR + N credits (one per resolved revenue account).
  const journalRows: Array<{
    organizationId: string
    journalEntryId: string
    chartOfAccountsId: string
    debitCents: number
    creditCents: number
    currencyCode: string
    description: string
    businessLineId: string | null
    partyId: string | null
    lineNumber: number
  }> = []

  journalRows.push({
    organizationId: opts.organizationId,
    journalEntryId: entryId,
    chartOfAccountsId: arAccountId,
    debitCents: opts.totalCents,
    creditCents: 0,
    currencyCode: opts.currencyCode,
    description: `AR — invoice ${opts.invoiceNumber}`,
    businessLineId: opts.invoiceBusinessLineId,
    partyId: opts.billToPartyId,
    lineNumber: 1,
  })

  let lineNumber = 2
  for (const [acctId, amount] of revenueByAccount) {
    journalRows.push({
      organizationId: opts.organizationId,
      journalEntryId: entryId,
      chartOfAccountsId: acctId,
      debitCents: 0,
      creditCents: amount,
      currencyCode: opts.currencyCode,
      description: `Revenue — invoice ${opts.invoiceNumber}`,
      businessLineId: opts.invoiceBusinessLineId,
      partyId: opts.billToPartyId,
      lineNumber: lineNumber++,
    })
  }

  await tx.insert(journalLines).values(journalRows)

  return { id: entryId, entryNumber, totalCents: opts.totalCents }
}
