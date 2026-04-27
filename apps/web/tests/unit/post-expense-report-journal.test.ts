import { describe, it, expect, vi, beforeEach } from 'vitest'

type Insert = { table: unknown; values: unknown }
const inserts: Insert[] = []

function makeTx(opts: { employeePayableId: string; cashId: string }) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
          limit: async () => {
            // findSystemAccount path: caller's WHERE clause carries the role,
            // but we can't inspect it here from the mock. Latch onto Promise
            // return order: post-expense-report-reimbursement awaits both
            // employee_payable then cash_operating in a Promise.all, but the
            // mock returns the same row. We discriminate via a sequence
            // counter so the first call resolves to employee_payable and
            // the second to cash_operating.
            roleCallCount += 1
            return roleCallCount === 1
              ? [{ id: opts.employeePayableId }]
              : [{ id: opts.cashId }]
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        inserts.push({ table, values })
        return values
      },
    }),
  }
}

let roleCallCount = 0

vi.mock('../../src/modules/finance/schema', () => ({
  journalEntries: { __table: 'journal_entries' },
  journalLines: { __table: 'journal_lines' },
  chartOfAccounts: { __table: 'chart_of_accounts' },
}))

vi.mock('../../src/lib/db/active', () => ({
  active: () => ({ __active: true }),
}))

const { postExpenseReportApprovalJournal } = await import(
  '@/modules/finance/lib/journal/post-expense-report-approval'
)
const { postExpenseReportReimbursementJournal } = await import(
  '@/modules/finance/lib/journal/post-expense-report-reimbursement'
)

describe('postExpenseReportApprovalJournal', () => {
  beforeEach(() => {
    inserts.length = 0
    roleCallCount = 0
  })

  it('posts a multi-line entry: N debits (one per expense) + 1 credit (employee_payable, sum)', async () => {
    const tx = makeTx({ employeePayableId: 'epay-id', cashId: 'cash-id' })

    const result = await postExpenseReportApprovalJournal(tx as never, {
      organizationId: 'org-1',
      reportId: 'rpt-1',
      reportNumber: 'EXP-2026-0001',
      entryDate: '2026-04-15',
      currencyCode: 'USD',
      reportPurpose: 'Apex client visit',
      expenses: [
        {
          expenseId: 'exp-1',
          chartOfAccountsId: 'travel-acct',
          amountCents: 25_000,
          businessLineId: 'bl-consulting',
          partyId: null,
          description: 'United flight',
        },
        {
          expenseId: 'exp-2',
          chartOfAccountsId: 'meals-acct',
          amountCents: 7_500,
          businessLineId: 'bl-consulting',
          partyId: null,
          description: 'Client dinner',
        },
        {
          expenseId: 'exp-3',
          chartOfAccountsId: 'travel-acct',
          amountCents: 12_500,
          businessLineId: 'bl-consulting',
          partyId: null,
          description: 'Hotel',
        },
      ],
    })

    expect(result.entryNumber).toBe('JE-2026-0001')
    expect(result.totalCents).toBe(45_000)

    // 1 entry insert + 1 batched lines insert
    expect(inserts).toHaveLength(2)

    const lines = inserts[1]!.values as Array<{
      chartOfAccountsId: string
      debitCents: number
      creditCents: number
      lineNumber: number
    }>
    expect(lines).toHaveLength(4) // 3 debits + 1 credit

    // ESSENTIAL invariant: SUM(debits) === SUM(credits). This test is the
    // first multi-line journal in the system; if it ever drifts, the SQL
    // aggregate check across all reports will catch it in production.
    const debits = lines.reduce((sum, l) => sum + l.debitCents, 0)
    const credits = lines.reduce((sum, l) => sum + l.creditCents, 0)
    expect(debits).toBe(45_000)
    expect(credits).toBe(45_000)
    expect(debits).toBe(credits)

    // Debit legs hit each expense's chart_of_accounts_id at its own amount.
    const debitLines = lines.filter((l) => l.debitCents > 0)
    expect(debitLines).toHaveLength(3)
    expect(debitLines.map((l) => l.chartOfAccountsId).sort()).toEqual(
      ['meals-acct', 'travel-acct', 'travel-acct'].sort(),
    )

    // Single credit leg hits employee_payable for the sum.
    const creditLine = lines.find((l) => l.creditCents > 0)
    expect(creditLine?.chartOfAccountsId).toBe('epay-id')
    expect(creditLine?.creditCents).toBe(45_000)
  })

  it('rejects an empty report (no debit legs ⇒ no journal)', async () => {
    const tx = makeTx({ employeePayableId: 'epay-id', cashId: 'cash-id' })
    await expect(
      postExpenseReportApprovalJournal(tx as never, {
        organizationId: 'org-1',
        reportId: 'rpt-1',
        reportNumber: 'EXP-2026-0001',
        entryDate: '2026-04-15',
        currencyCode: 'USD',
        reportPurpose: 'Empty',
        expenses: [],
      }),
    ).rejects.toThrow(/no expenses/i)
  })
})

describe('postExpenseReportReimbursementJournal', () => {
  beforeEach(() => {
    inserts.length = 0
    roleCallCount = 0
  })

  it('posts a balanced 2-line entry: DEBIT employee_payable, CREDIT cash_operating', async () => {
    const tx = makeTx({ employeePayableId: 'epay-id', cashId: 'cash-id' })

    const result = await postExpenseReportReimbursementJournal(tx as never, {
      organizationId: 'org-1',
      reportId: 'rpt-1',
      reportNumber: 'EXP-2026-0001',
      entryDate: '2026-04-20',
      totalCents: 45_000,
      currencyCode: 'USD',
      subjectPartyId: 'employee-party',
      businessLineId: 'bl-consulting',
      reportPurpose: 'Apex client visit',
    })

    expect(result.entryNumber).toBe('JE-2026-0001')
    expect(inserts).toHaveLength(2)

    const lines = inserts[1]!.values as Array<{
      chartOfAccountsId: string
      debitCents: number
      creditCents: number
    }>
    expect(lines).toHaveLength(2)

    // Balanced.
    const debits = lines.reduce((sum, l) => sum + l.debitCents, 0)
    const credits = lines.reduce((sum, l) => sum + l.creditCents, 0)
    expect(debits).toBe(45_000)
    expect(credits).toBe(45_000)

    // Debit employee_payable (settle the liability).
    const debit = lines.find((l) => l.debitCents > 0)
    expect(debit?.chartOfAccountsId).toBe('epay-id')

    // Credit cash_operating (cash leaves).
    const credit = lines.find((l) => l.creditCents > 0)
    expect(credit?.chartOfAccountsId).toBe('cash-id')
  })

  it('rejects zero/negative totals', async () => {
    const tx = makeTx({ employeePayableId: 'epay-id', cashId: 'cash-id' })
    await expect(
      postExpenseReportReimbursementJournal(tx as never, {
        organizationId: 'org-1',
        reportId: 'rpt-1',
        reportNumber: 'EXP-2026-0001',
        entryDate: '2026-04-20',
        totalCents: 0,
        currencyCode: 'USD',
        reportPurpose: '',
      }),
    ).rejects.toThrow(/must be > 0/)
  })
})
