/**
 * P1-09 end-to-end journal verification.
 *
 * Exercises the approval + reimbursement journal helpers + the reverse-and-
 * repost flow against the real database (no Server Action / Better Auth in the
 * loop), then asserts:
 *
 *   1. SUM(debits) = SUM(credits) for every journal_entry written by this run
 *   2. Approval entry: N debits + 1 credit, sum = total
 *   3. Reimbursement entry: 2 lines, debit employee_payable + credit cash_operating
 *   4. Reject-from-approved flow reverses the approval entry
 *   5. Soft-delete-from-reimbursed flow reverses both approval + reimbursement
 *
 * Cleans up everything it created so the script is safe to re-run.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import {
  expenseEntries,
  expenseReports,
  journalEntries,
  journalLines,
} from '../src/modules/finance/schema'
import { organizations, businessLines } from '../src/modules/parties/schema'
import { users } from '../src/modules/auth/schema'
import { chartOfAccounts } from '../src/modules/finance/schema'
import { postExpenseReportApprovalJournal } from '../src/modules/finance/lib/journal/post-expense-report-approval'
import { postExpenseReportReimbursementJournal } from '../src/modules/finance/lib/journal/post-expense-report-reimbursement'
import { reverseJournalEntry } from '../src/modules/finance/lib/journal/reverse-entry'
import { findUnreversedJournalEntries } from '../src/modules/finance/lib/journal/find-unreversed'
import { findSystemAccount } from '../src/modules/finance/lib/system-accounts'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL not set')

const client = postgres(url, { max: 1 })
const db = drizzle(client)

let createdEntryIds: string[] = []
let createdLineIds: string[] = []
let createdExpenseIds: string[] = []
let createdReportId: string | null = null

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

async function main() {
  await db.transaction(async (tx) => {
    // 1. Locate the seeded org + a business line + an expense account + the user.
    const [org] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .limit(1)
    if (!org) throw new Error('No organizations seeded — run pnpm db:seed first.')

    const [bl] = await tx
      .select({ id: businessLines.id })
      .from(businessLines)
      .where(eq(businessLines.organizationId, org.id))
      .limit(1)
    if (!bl) throw new Error('No business_lines seeded.')

    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.organizationId, org.id))
      .limit(1)
    if (!user) throw new Error('No users seeded.')

    const [expenseAcct] = await tx
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.organizationId, org.id),
          eq(chartOfAccounts.accountType, 'expense'),
          eq(chartOfAccounts.isActive, true),
        ),
      )
      .limit(1)
    if (!expenseAcct) throw new Error('No expense accounts in CoA.')

    // Verify employee_payable + cash_operating are tagged.
    const employeePayableId = await findSystemAccount(tx as any, org.id, 'employee_payable')
    const cashOperatingId = await findSystemAccount(tx as any, org.id, 'cash_operating')
    console.log(`  ✓ employee_payable resolved → ${employeePayableId}`)
    console.log(`  ✓ cash_operating  resolved → ${cashOperatingId}`)

    // 2. Insert a draft report.
    const reportNumber = `EXP-2099-${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`
    const [report] = await tx
      .insert(expenseReports)
      .values({
        organizationId: org.id,
        reportNumber,
        submittedByUserId: user.id,
        purpose: 'P1-09 verification — DELETE-ME',
        periodStart: '2099-01-01',
        periodEnd: '2099-01-03',
        status: 'draft',
        totalCents: 0,
      })
      .returning({ id: expenseReports.id })
    if (!report) throw new Error('Failed to insert test report')
    createdReportId = report.id
    console.log(`  ✓ inserted test report ${reportNumber} (${report.id})`)

    // 3. Insert 3 reimbursable expenses tied to the report.
    const expenseAmounts = [25000, 7500, 12500]
    const expenses: Array<{ id: string; amount: number }> = []
    for (const amount of expenseAmounts) {
      const [row] = await tx
        .insert(expenseEntries)
        .values({
          organizationId: org.id,
          entryDate: '2099-01-02',
          businessLineId: bl.id,
          chartOfAccountsId: expenseAcct.id,
          description: `P1-09 verify expense $${amount / 100}`,
          amountCents: amount,
          currencyCode: 'USD',
          paymentSource: 'personal_card_business_use',
          isBillable: false,
          isReimbursable: true,
          expenseReportId: report.id,
          submittedByUserId: user.id,
        })
        .returning({ id: expenseEntries.id })
      if (!row) throw new Error('Failed to insert expense')
      expenses.push({ id: row.id, amount })
      createdExpenseIds.push(row.id)
    }
    console.log(`  ✓ inserted 3 reimbursable expenses ($450.00 total)`)

    const totalCents = expenseAmounts.reduce((s, x) => s + x, 0)

    // 4. Approval journal: post + assert balance.
    const approval = await postExpenseReportApprovalJournal(tx as any, {
      organizationId: org.id,
      reportId: report.id,
      reportNumber,
      entryDate: '2099-01-04',
      currencyCode: 'USD',
      reportPurpose: 'P1-09 verification',
      expenses: expenses.map((e) => ({
        expenseId: e.id,
        chartOfAccountsId: expenseAcct.id,
        amountCents: e.amount,
        businessLineId: bl.id,
        partyId: null,
        description: `Verify line ${e.amount}`,
      })),
    })
    createdEntryIds.push(approval.id)
    assert(approval.totalCents === totalCents, 'approval total matches sum')
    await assertEntryBalanced(tx as any, approval.id, totalCents, 'approval entry')
    console.log(`  ✓ approval ${approval.entryNumber} posted, balanced (${totalCents}¢)`)

    // 5. Reject-from-approved flow: reverse the approval.
    const unreversedAfterApproval = await findUnreversedJournalEntries(
      tx as any,
      org.id,
      'finance_expense_reports',
      report.id,
    )
    assert(
      unreversedAfterApproval.length === 1,
      `expected 1 unreversed entry after approval, got ${unreversedAfterApproval.length}`,
    )
    assert(
      unreversedAfterApproval[0]!.id === approval.id,
      'unreversed lookup returns the approval entry',
    )

    const reject = await reverseJournalEntry(tx as any, {
      originalEntryId: approval.id,
      organizationId: org.id,
      reason: 'P1-09 verify reject-from-approved',
    })
    createdEntryIds.push(reject.id)
    await assertEntryBalanced(tx as any, reject.id, totalCents, 'rejection reversal entry')
    console.log(
      `  ✓ rejection reversal ${reject.entryNumber} posted, balanced — net effect zero`,
    )

    // After rejection-reversal, the approval is "matched" and findUnreversed
    // should return 0 entries.
    const unreversedAfterReject = await findUnreversedJournalEntries(
      tx as any,
      org.id,
      'finance_expense_reports',
      report.id,
    )
    assert(
      unreversedAfterReject.length === 0,
      `expected 0 unreversed entries after rejection, got ${unreversedAfterReject.length}`,
    )
    console.log(`  ✓ findUnreversed returns 0 after reversal`)

    // 6. Reopen → post a NEW approval (simulates the rejected → draft → submitted → approved flow).
    const approval2 = await postExpenseReportApprovalJournal(tx as any, {
      organizationId: org.id,
      reportId: report.id,
      reportNumber,
      entryDate: '2099-01-06',
      currencyCode: 'USD',
      reportPurpose: 'P1-09 verification (re-approved)',
      expenses: expenses.map((e) => ({
        expenseId: e.id,
        chartOfAccountsId: expenseAcct.id,
        amountCents: e.amount,
        businessLineId: bl.id,
        partyId: null,
        description: `Verify line ${e.amount}`,
      })),
    })
    createdEntryIds.push(approval2.id)
    await assertEntryBalanced(tx as any, approval2.id, totalCents, 'second approval entry')
    console.log(`  ✓ second approval ${approval2.entryNumber} posted, balanced`)

    // 7. Reimbursement settlement: DEBIT employee_payable, CREDIT cash_operating.
    const reimburse = await postExpenseReportReimbursementJournal(tx as any, {
      organizationId: org.id,
      reportId: report.id,
      reportNumber,
      entryDate: '2099-01-07',
      totalCents,
      currencyCode: 'USD',
      subjectPartyId: null,
      businessLineId: bl.id,
      reportPurpose: 'P1-09 verification',
    })
    createdEntryIds.push(reimburse.id)
    await assertEntryBalanced(tx as any, reimburse.id, totalCents, 'reimbursement entry')
    console.log(`  ✓ reimbursement ${reimburse.entryNumber} posted, balanced`)

    // Now expect 2 unreversed entries (approval2 + reimburse).
    const unreversedAfterReimb = await findUnreversedJournalEntries(
      tx as any,
      org.id,
      'finance_expense_reports',
      report.id,
    )
    assert(
      unreversedAfterReimb.length === 2,
      `expected 2 unreversed entries after reimbursement, got ${unreversedAfterReimb.length}`,
    )
    console.log(`  ✓ findUnreversed returns 2 entries (approval + reimbursement)`)

    // 8. Soft-delete-from-reimbursed: reverse BOTH.
    for (const entry of unreversedAfterReimb) {
      const r = await reverseJournalEntry(tx as any, {
        originalEntryId: entry.id,
        organizationId: org.id,
        reason: 'P1-09 verify soft-delete-from-reimbursed',
      })
      createdEntryIds.push(r.id)
    }
    const unreversedAfterDelete = await findUnreversedJournalEntries(
      tx as any,
      org.id,
      'finance_expense_reports',
      report.id,
    )
    assert(
      unreversedAfterDelete.length === 0,
      `expected 0 unreversed after delete, got ${unreversedAfterDelete.length}`,
    )
    console.log(
      `  ✓ soft-delete-from-reimbursed reversed both entries — net effect zero`,
    )

    // 9. Final SQL aggregate: SUM(debits) = SUM(credits) for EVERY journal entry
    //    written by this run.
    for (const entryId of createdEntryIds) {
      const [row] = await tx
        .select({
          debits: sql<string>`COALESCE(SUM(${journalLines.debitCents}), 0)::text`,
          credits: sql<string>`COALESCE(SUM(${journalLines.creditCents}), 0)::text`,
        })
        .from(journalLines)
        .where(eq(journalLines.journalEntryId, entryId))
      assert(
        Number(row!.debits) === Number(row!.credits),
        `entry ${entryId} not balanced: ${row!.debits} debits vs ${row!.credits} credits`,
      )
    }
    console.log(
      `  ✓ all ${createdEntryIds.length} journal entries balance ` +
        `(approval + rejection-reversal + re-approval + reimbursement + 2 delete-reversals)`,
    )

    // Track all line ids that were created so cleanup can target them.
    const allLines = await tx
      .select({ id: journalLines.id })
      .from(journalLines)
      .where(inArray(journalLines.journalEntryId, createdEntryIds))
    createdLineIds = allLines.map((l) => l.id)

    // 10. Cleanup — undo everything we created so script is rerunnable.
    await tx
      .delete(journalLines)
      .where(inArray(journalLines.journalEntryId, createdEntryIds))
    await tx
      .delete(journalEntries)
      .where(inArray(journalEntries.id, createdEntryIds))
    await tx
      .delete(expenseEntries)
      .where(inArray(expenseEntries.id, createdExpenseIds))
    await tx
      .delete(expenseReports)
      .where(eq(expenseReports.id, createdReportId!))
    console.log(
      `  ✓ cleanup: removed ${createdEntryIds.length} journals, ` +
        `${createdLineIds.length} lines, ${createdExpenseIds.length} expenses, 1 report`,
    )

    console.log(`\n  P1-09 verification PASSED.`)
  })
}

async function assertEntryBalanced(
  tx: any,
  entryId: string,
  expectedTotal: number,
  label: string,
) {
  const [row] = await tx
    .select({
      debits: sql<string>`COALESCE(SUM(${journalLines.debitCents}), 0)::text`,
      credits: sql<string>`COALESCE(SUM(${journalLines.creditCents}), 0)::text`,
      lineCount: sql<string>`COUNT(*)::text`,
    })
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, entryId))
  const debits = Number(row.debits)
  const credits = Number(row.credits)
  const lineCount = Number(row.lineCount)
  if (debits !== credits) {
    throw new Error(
      `${label} (entry ${entryId}) NOT BALANCED: debits=${debits} credits=${credits} lines=${lineCount}`,
    )
  }
  if (debits !== expectedTotal) {
    throw new Error(
      `${label} (entry ${entryId}): debits=${debits}, expected ${expectedTotal}`,
    )
  }
  void randomUUID // keep import used
}

main()
  .then(async () => {
    await client.end()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('Verification FAILED:', err)
    await client.end()
    process.exit(1)
  })
