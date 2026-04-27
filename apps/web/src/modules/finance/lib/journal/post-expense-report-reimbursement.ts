import { randomUUID } from 'node:crypto'
import { journalEntries, journalLines } from '../../schema'
import { findSystemAccount } from '../system-accounts'
import { nextEntryNumber } from './next-entry-number'
import type { FinanceTx } from '@/lib/audit/with-audit'

export interface PostExpenseReportReimbursementJournalOptions {
  organizationId: string
  reportId: string
  reportNumber: string
  /** Settlement date — typically the report's reimbursed_at (UTC date). */
  entryDate: string
  totalCents: number
  currencyCode: string
  /** Subject Party (the employee getting reimbursed). Carried on both lines. */
  subjectPartyId?: string | null
  /** Optional business_line tag for the entry. Falls back to NULL. */
  businessLineId?: string | null
  reportPurpose: string
}

export interface PostedJournalEntry {
  id: string
  entryNumber: string
}

/**
 * Posts the 2-line reimbursement settlement entry for an expense report:
 *
 *   DEBIT  employee_payable  for totalCents     (settle liability)
 *   CREDIT cash_operating    for totalCents     (cash leaves)
 *
 * Reverses the liability recognized at approval. After this entry, the
 * employee_payable account balance for this report is back to zero.
 */
export async function postExpenseReportReimbursementJournal(
  tx: FinanceTx,
  opts: PostExpenseReportReimbursementJournalOptions,
): Promise<PostedJournalEntry> {
  if (opts.totalCents <= 0) {
    throw new Error('Cannot post reimbursement journal: total must be > 0')
  }

  const [employeePayableAccountId, cashOperatingAccountId] = await Promise.all([
    findSystemAccount(tx, opts.organizationId, 'employee_payable'),
    findSystemAccount(tx, opts.organizationId, 'cash_operating'),
  ])

  const year = Number(opts.entryDate.slice(0, 4))
  const entryNumber = await nextEntryNumber(tx, opts.organizationId, year)
  const entryId = randomUUID()

  await tx.insert(journalEntries).values({
    id: entryId,
    organizationId: opts.organizationId,
    entryDate: opts.entryDate,
    entryNumber,
    description: `Expense report ${opts.reportNumber} reimbursed — ${opts.reportPurpose}`,
    sourceTable: 'finance_expense_reports',
    sourceId: opts.reportId,
    isReversal: false,
  })

  await tx.insert(journalLines).values([
    {
      organizationId: opts.organizationId,
      journalEntryId: entryId,
      chartOfAccountsId: employeePayableAccountId,
      debitCents: opts.totalCents,
      creditCents: 0,
      currencyCode: opts.currencyCode,
      description: `Settle employee reimbursement — ${opts.reportNumber}`,
      businessLineId: opts.businessLineId ?? null,
      partyId: opts.subjectPartyId ?? null,
      lineNumber: 1,
    },
    {
      organizationId: opts.organizationId,
      journalEntryId: entryId,
      chartOfAccountsId: cashOperatingAccountId,
      debitCents: 0,
      creditCents: opts.totalCents,
      currencyCode: opts.currencyCode,
      description: `Cash out — reimbursed ${opts.reportNumber}`,
      businessLineId: opts.businessLineId ?? null,
      partyId: opts.subjectPartyId ?? null,
      lineNumber: 2,
    },
  ])

  return { id: entryId, entryNumber }
}
