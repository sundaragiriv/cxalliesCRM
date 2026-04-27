import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture every insert + select against the mocked tx so we can assert the
// 2-line journal balances and is keyed correctly.
type Insert = { table: unknown; values: unknown }
const inserts: Insert[] = []

// Mock tx: select (for nextEntryNumber lookup + system account lookup) +
// insert (for journal_entries + journal_lines).
function makeTx(opts: {
  cashAccountId: string
  arAccountId: string
  systemRole: string
}) {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
          limit: async () => {
            // findSystemAccount path returns the account row keyed by role.
            return [{ id: opts.systemRole === 'cash_operating' ? opts.cashAccountId : opts.arAccountId }]
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
  return tx
}

vi.mock('../../src/modules/finance/schema', () => ({
  journalEntries: { __table: 'journal_entries' },
  journalLines: { __table: 'journal_lines' },
  chartOfAccounts: { __table: 'chart_of_accounts' },
}))

vi.mock('../../src/lib/db/active', () => ({
  active: () => ({ __active: true }),
}))

const { postRevenueJournal } = await import('@/modules/finance/lib/journal/post-revenue')

describe('postRevenueJournal', () => {
  beforeEach(() => {
    inserts.length = 0
  })

  it('posts a balanced 2-line entry with cash debit when paymentStatus="received"', async () => {
    const tx = makeTx({
      cashAccountId: 'cash-id',
      arAccountId: 'ar-id',
      systemRole: 'cash_operating',
    })

    const result = await postRevenueJournal(tx as never, {
      organizationId: 'org-1',
      revenueId: 'rev-1',
      entryDate: '2026-04-15',
      businessLineId: 'bl-1',
      partyId: 'party-1',
      revenueChartOfAccountsId: 'rev-acct-1',
      amountCents: 50_000,
      currencyCode: 'USD',
      description: 'May consulting',
      paymentStatus: 'received',
    })

    expect(result.entryNumber).toBe('JE-2026-0001')

    // 1 entry insert + 1 batched lines insert
    expect(inserts).toHaveLength(2)

    // First insert: the journal_entry row
    const entryInsert = inserts[0]?.values as { id: string; entryDate: string; sourceTable: string }
    expect(entryInsert).toMatchObject({
      organizationId: 'org-1',
      entryDate: '2026-04-15',
      entryNumber: 'JE-2026-0001',
      sourceTable: 'finance_revenue_entries',
      sourceId: 'rev-1',
      isReversal: false,
    })

    // Second insert: an array of 2 line rows
    const lines = inserts[1]?.values as Array<{
      chartOfAccountsId: string
      debitCents: number
      creditCents: number
      lineNumber: number
    }>
    expect(lines).toHaveLength(2)

    const debits = lines.reduce((sum, l) => sum + l.debitCents, 0)
    const credits = lines.reduce((sum, l) => sum + l.creditCents, 0)
    expect(debits).toBe(50_000)
    expect(credits).toBe(50_000)
    expect(debits).toBe(credits) // balanced

    // Cash debited (paymentStatus='received' → cash_operating)
    const debit = lines.find((l) => l.debitCents > 0)
    expect(debit?.chartOfAccountsId).toBe('cash-id')

    // Revenue credited (the account user picked)
    const credit = lines.find((l) => l.creditCents > 0)
    expect(credit?.chartOfAccountsId).toBe('rev-acct-1')
  })

  it('posts a balanced 2-line entry with AR debit when paymentStatus="expected"', async () => {
    const tx = makeTx({
      cashAccountId: 'cash-id',
      arAccountId: 'ar-id',
      systemRole: 'ar_default',
    })

    await postRevenueJournal(tx as never, {
      organizationId: 'org-1',
      revenueId: 'rev-2',
      entryDate: '2026-04-20',
      businessLineId: 'bl-1',
      partyId: null,
      revenueChartOfAccountsId: 'rev-acct-2',
      amountCents: 12_345,
      currencyCode: 'USD',
      description: 'Invoice 2026-0042',
      paymentStatus: 'expected',
    })

    const lines = inserts[1]?.values as Array<{
      chartOfAccountsId: string
      debitCents: number
      creditCents: number
    }>
    const debit = lines.find((l) => l.debitCents > 0)
    expect(debit?.chartOfAccountsId).toBe('ar-id')

    const total = lines.reduce((sum, l) => sum + l.debitCents + l.creditCents, 0)
    expect(total).toBe(2 * 12_345) // both legs sum to 2× amount
  })
})
