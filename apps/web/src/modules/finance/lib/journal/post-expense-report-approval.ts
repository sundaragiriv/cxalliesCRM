import { randomUUID } from 'node:crypto'
import { journalEntries, journalLines } from '../../schema'
import { findSystemAccount } from '../system-accounts'
import { nextEntryNumber } from './next-entry-number'
import type { FinanceTx } from '@/lib/audit/with-audit'

export interface ExpenseLineForApproval {
  expenseId: string
  chartOfAccountsId: string
  amountCents: number
  businessLineId: string
  partyId?: string | null
  description: string
}

export interface PostExpenseReportApprovalJournalOptions {
  organizationId: string
  reportId: string
  reportNumber: string
  /** Recognition date — typically the report's approved_at (UTC date). */
  entryDate: string
  currencyCode: string
  expenses: ReadonlyArray<ExpenseLineForApproval>
  /** Free-text note attached to the entry's description. */
  reportPurpose: string
}

export interface PostedJournalEntry {
  id: string
  entryNumber: string
  totalCents: number
}

/**
 * Posts a multi-line approval journal entry for an expense report:
 *
 *   For each expense E on the report:
 *     DEBIT  E.chartOfAccountsId  by E.amountCents
 *
 *   Single offsetting credit:
 *     CREDIT employee_payable for SUM(E.amountCents)
 *
 * Recognizes the expense (P&L) and the liability (BS) at approval time.
 * Reimbursement settles the liability against cash via
 * postExpenseReportReimbursementJournal.
 *
 * The journal_entry's source_table is 'finance_expense_reports', source_id
 * is the report id — both legs of the lifecycle (approval + reimbursement)
 * point at the same report so reports can group them.
 *
 * Caller is responsible for storing the returned entry id wherever the
 * report or expenses need to reference it (Phase 1: not stored on the report
 * row; reverseJournalEntry traces source_table/source_id when needed).
 */
export async function postExpenseReportApprovalJournal(
  tx: FinanceTx,
  opts: PostExpenseReportApprovalJournalOptions,
): Promise<PostedJournalEntry> {
  if (opts.expenses.length === 0) {
    throw new Error('Cannot post approval journal: report has no expenses')
  }

  const employeePayableAccountId = await findSystemAccount(
    tx,
    opts.organizationId,
    'employee_payable',
  )

  const totalCents = opts.expenses.reduce((sum, exp) => sum + exp.amountCents, 0)
  if (totalCents <= 0) {
    throw new Error('Cannot post approval journal: total must be > 0')
  }

  const year = Number(opts.entryDate.slice(0, 4))
  const entryNumber = await nextEntryNumber(tx, opts.organizationId, year)
  const entryId = randomUUID()

  await tx.insert(journalEntries).values({
    id: entryId,
    organizationId: opts.organizationId,
    entryDate: opts.entryDate,
    entryNumber,
    description: `Expense report ${opts.reportNumber} approved — ${opts.reportPurpose}`,
    sourceTable: 'finance_expense_reports',
    sourceId: opts.reportId,
    isReversal: false,
  })

  // Pick the report-level business_line for the credit leg by majority among
  // expense lines. Avoids forcing a "report-level" business_line column; uses
  // the data we already have. Ties go to the first encountered.
  //
  // Phase 1 simplification — single credit line tagged with the majority BL.
  // Phase 2 (when P1-22 reporting surfaces per-BL liabilities) revisits via
  // either a report-level business_line_id or a proportional credit split.
  const blCounts = new Map<string, number>()
  for (const exp of opts.expenses) {
    blCounts.set(exp.businessLineId, (blCounts.get(exp.businessLineId) ?? 0) + 1)
  }
  let creditBusinessLineId = opts.expenses[0]!.businessLineId
  let bestCount = 0
  for (const [bl, count] of blCounts) {
    if (count > bestCount) {
      bestCount = count
      creditBusinessLineId = bl
    }
  }

  // Multi-line: N debits (one per expense), 1 credit (employee_payable, sum).
  const lines = opts.expenses.map((exp, idx) => ({
    organizationId: opts.organizationId,
    journalEntryId: entryId,
    chartOfAccountsId: exp.chartOfAccountsId,
    debitCents: exp.amountCents,
    creditCents: 0,
    currencyCode: opts.currencyCode,
    description: exp.description,
    businessLineId: exp.businessLineId,
    partyId: exp.partyId ?? null,
    lineNumber: idx + 1,
  }))

  lines.push({
    organizationId: opts.organizationId,
    journalEntryId: entryId,
    chartOfAccountsId: employeePayableAccountId,
    debitCents: 0,
    creditCents: totalCents,
    currencyCode: opts.currencyCode,
    description: `Owed to employee — ${opts.reportNumber}`,
    businessLineId: creditBusinessLineId,
    partyId: null,
    lineNumber: opts.expenses.length + 1,
  })

  await tx.insert(journalLines).values(lines)

  return { id: entryId, entryNumber, totalCents }
}
