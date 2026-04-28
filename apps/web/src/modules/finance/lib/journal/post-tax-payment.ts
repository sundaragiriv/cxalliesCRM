import { randomUUID } from 'node:crypto'
import { journalEntries, journalLines } from '../../schema'
import { findSystemAccount } from '../system-accounts'
import { nextEntryNumber } from './next-entry-number'
import type { FinanceTx } from '@/lib/audit/with-audit'

export interface PostTaxPaymentJournalOptions {
  organizationId: string
  taxEstimateId: string
  /** Settlement date — typically the user-entered paid_on (UTC date). */
  entryDate: string
  /** Federal income tax portion of the payment. May be 0. */
  federalCents: number
  /** State income tax portion. May be 0. */
  stateCents: number
  /** Self-employment tax portion. May be 0. */
  seCents: number
  /** EFTPS confirmation, check number, etc. — embedded in line descriptions. */
  paymentReference: string
  taxYear: number
  /** 1-4. */
  taxQuarter: number
  currencyCode?: string
}

export interface PostedJournalEntry {
  id: string
  entryNumber: string
  totalCents: number
}

/**
 * Posts the multi-line tax-payment settlement entry.
 *
 * Phase 1 model: pass-through entity; tax is owner equity reduction (not a
 * business expense). Single debit account (owner_draws), 3 lines for
 * per-kind reporting via line descriptions. Single credit to cash_operating.
 *
 *   DEBIT  Owner Draws    federalCents   "Federal income tax YYYY Q#"
 *   DEBIT  Owner Draws    stateCents     "State income tax YYYY Q#"
 *   DEBIT  Owner Draws    seCents        "Self-employment tax YYYY Q#"
 *   CREDIT Cash Operating total          "Tax payment — {reference}"
 *
 * Lines with $0 amount are skipped (defensive; SE-only quarters in low
 * income years would otherwise insert a zero debit line that violates the
 * journal_lines CHECK constraint).
 *
 * Source: finance_tax_estimates / source_id: estimate.id
 *
 * Net effect: cash decreases, owner equity decreases. Pure pass-through
 * tax payment for an LLC member. Tax-payable accounts (2200/2210/2220)
 * stay in CoA but unused; reserved for Phase 2 accrual model.
 */
export async function postTaxPaymentJournal(
  tx: FinanceTx,
  opts: PostTaxPaymentJournalOptions,
): Promise<PostedJournalEntry> {
  const totalCents = opts.federalCents + opts.stateCents + opts.seCents
  if (totalCents <= 0) {
    throw new Error('Cannot post tax-payment journal: total must be > 0')
  }
  if (opts.federalCents < 0 || opts.stateCents < 0 || opts.seCents < 0) {
    throw new Error('Tax payment components must be non-negative')
  }

  const [ownerDrawsAccountId, cashOperatingAccountId] = await Promise.all([
    findSystemAccount(tx, opts.organizationId, 'owner_draws'),
    findSystemAccount(tx, opts.organizationId, 'cash_operating'),
  ])

  const year = Number(opts.entryDate.slice(0, 4))
  const entryNumber = await nextEntryNumber(tx, opts.organizationId, year)
  const entryId = randomUUID()
  const currency = opts.currencyCode ?? 'USD'
  const periodLabel = `${opts.taxYear} Q${opts.taxQuarter}`

  await tx.insert(journalEntries).values({
    id: entryId,
    organizationId: opts.organizationId,
    entryDate: opts.entryDate,
    entryNumber,
    description: `Tax payment ${periodLabel} — ${opts.paymentReference}`,
    sourceTable: 'finance_tax_estimates',
    sourceId: opts.taxEstimateId,
    isReversal: false,
  })

  // Build debit lines, skipping zero-amount components so we never insert a
  // (debit=0, credit=0) line that would fail the journal_lines CHECK.
  const debitLines: Array<{
    chartOfAccountsId: string
    debitCents: number
    creditCents: number
    currencyCode: string
    description: string
    businessLineId: string | null
    partyId: string | null
    lineNumber: number
    organizationId: string
    journalEntryId: string
  }> = []
  let lineNumber = 1
  if (opts.federalCents > 0) {
    debitLines.push({
      organizationId: opts.organizationId,
      journalEntryId: entryId,
      chartOfAccountsId: ownerDrawsAccountId,
      debitCents: opts.federalCents,
      creditCents: 0,
      currencyCode: currency,
      description: `Federal income tax ${periodLabel}`,
      businessLineId: null,
      partyId: null,
      lineNumber: lineNumber++,
    })
  }
  if (opts.stateCents > 0) {
    debitLines.push({
      organizationId: opts.organizationId,
      journalEntryId: entryId,
      chartOfAccountsId: ownerDrawsAccountId,
      debitCents: opts.stateCents,
      creditCents: 0,
      currencyCode: currency,
      description: `State income tax ${periodLabel}`,
      businessLineId: null,
      partyId: null,
      lineNumber: lineNumber++,
    })
  }
  if (opts.seCents > 0) {
    debitLines.push({
      organizationId: opts.organizationId,
      journalEntryId: entryId,
      chartOfAccountsId: ownerDrawsAccountId,
      debitCents: opts.seCents,
      creditCents: 0,
      currencyCode: currency,
      description: `Self-employment tax ${periodLabel}`,
      businessLineId: null,
      partyId: null,
      lineNumber: lineNumber++,
    })
  }

  const creditLine = {
    organizationId: opts.organizationId,
    journalEntryId: entryId,
    chartOfAccountsId: cashOperatingAccountId,
    debitCents: 0,
    creditCents: totalCents,
    currencyCode: currency,
    description: `Tax payment ${periodLabel} — ${opts.paymentReference}`,
    businessLineId: null,
    partyId: null,
    lineNumber: lineNumber++,
  }

  await tx.insert(journalLines).values([...debitLines, creditLine])

  return { id: entryId, entryNumber, totalCents }
}
