import { randomUUID } from 'node:crypto'
import { journalEntries, journalLines } from '../../schema'
import { findSystemAccount } from '../system-accounts'
import { nextEntryNumber } from './next-entry-number'
import type { FinanceTx } from '@/lib/audit/with-audit'

export interface PostPaymentJournalOptions {
  organizationId: string
  paymentId: string
  paymentNumber: string
  /** Settlement date — typically the payment_date. */
  entryDate: string
  /** Amount paid; appears on both legs. */
  amountCents: number
  currencyCode: string
  /** Payor party — carried on both legs for AR-aging reports. */
  fromPartyId: string
  /** Optional BL hint for reporting; null for cross-BL payments. */
  businessLineId: string | null
  /** Optional invoice number(s) for description. */
  appliedToInvoiceNumbers: ReadonlyArray<string>
}

export interface PostedJournalEntry {
  id: string
  entryNumber: string
}

/**
 * Posts the 2-line payment settlement entry:
 *
 *   DEBIT  cash_operating       amountCents     (cash arrives)
 *   CREDIT ar_default            amountCents     (AR cleared)
 *
 * Source: finance_journal_entries.source_table='billing_payments',
 *         source_id = payment.id
 *
 * One journal entry per payment row. Even when a payment spans multiple
 * invoices via billing_payment_applications (Phase 2), the journal stays
 * 2-line — the per-invoice traceability lives in payment_applications.
 *
 * Reverse via reverseJournalEntry on payment soft-delete (Phase 2 refund).
 */
export async function postPaymentJournal(
  tx: FinanceTx,
  opts: PostPaymentJournalOptions,
): Promise<PostedJournalEntry> {
  if (opts.amountCents <= 0) {
    throw new Error('Cannot post payment journal: amount must be > 0')
  }

  const [cashId, arId] = await Promise.all([
    findSystemAccount(tx, opts.organizationId, 'cash_operating'),
    findSystemAccount(tx, opts.organizationId, 'ar_default'),
  ])

  const year = Number(opts.entryDate.slice(0, 4))
  const entryNumber = await nextEntryNumber(tx, opts.organizationId, year)
  const entryId = randomUUID()

  const appliedTo = opts.appliedToInvoiceNumbers.length
    ? ` (applied to ${opts.appliedToInvoiceNumbers.join(', ')})`
    : ''

  await tx.insert(journalEntries).values({
    id: entryId,
    organizationId: opts.organizationId,
    entryDate: opts.entryDate,
    entryNumber,
    description: `Payment ${opts.paymentNumber}${appliedTo}`,
    sourceTable: 'billing_payments',
    sourceId: opts.paymentId,
    isReversal: false,
  })

  await tx.insert(journalLines).values([
    {
      organizationId: opts.organizationId,
      journalEntryId: entryId,
      chartOfAccountsId: cashId,
      debitCents: opts.amountCents,
      creditCents: 0,
      currencyCode: opts.currencyCode,
      description: `Cash received — ${opts.paymentNumber}`,
      businessLineId: opts.businessLineId,
      partyId: opts.fromPartyId,
      lineNumber: 1,
    },
    {
      organizationId: opts.organizationId,
      journalEntryId: entryId,
      chartOfAccountsId: arId,
      debitCents: 0,
      creditCents: opts.amountCents,
      currencyCode: opts.currencyCode,
      description: `AR cleared — ${opts.paymentNumber}`,
      businessLineId: opts.businessLineId,
      partyId: opts.fromPartyId,
      lineNumber: 2,
    },
  ])

  return { id: entryId, entryNumber }
}
