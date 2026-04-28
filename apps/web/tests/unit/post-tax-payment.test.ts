import { describe, it, expect, vi, beforeEach } from 'vitest'

type Insert = { table: unknown; values: unknown }
const inserts: Insert[] = []

let roleCallCount = 0

function makeTx(opts: { ownerDrawsId: string; cashId: string }) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
          limit: async () => {
            // Promise.all order: owner_draws is requested first in
            // post-tax-payment, then cash_operating.
            roleCallCount += 1
            return roleCallCount === 1
              ? [{ id: opts.ownerDrawsId }]
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

vi.mock('../../src/modules/finance/schema', () => ({
  journalEntries: { __table: 'journal_entries' },
  journalLines: { __table: 'journal_lines' },
  chartOfAccounts: { __table: 'chart_of_accounts' },
}))

vi.mock('../../src/lib/db/active', () => ({
  active: () => ({ __active: true }),
}))

const { postTaxPaymentJournal } = await import(
  '@/modules/finance/lib/journal/post-tax-payment'
)

describe('postTaxPaymentJournal', () => {
  beforeEach(() => {
    inserts.length = 0
    roleCallCount = 0
  })

  it('posts a balanced 4-line entry: 3 debits to owner_draws + 1 credit to cash', async () => {
    const tx = makeTx({ ownerDrawsId: 'odraw-id', cashId: 'cash-id' })

    const result = await postTaxPaymentJournal(tx as never, {
      organizationId: 'org-1',
      taxEstimateId: 'est-1',
      entryDate: '2026-04-15',
      federalCents: 250_000,
      stateCents: 50_000,
      seCents: 175_000,
      paymentReference: 'EFTPS 2026Q1-12345',
      taxYear: 2026,
      taxQuarter: 1,
    })

    expect(result.entryNumber).toBe('JE-2026-0001')
    expect(result.totalCents).toBe(475_000)

    expect(inserts).toHaveLength(2) // entry + lines

    const lines = inserts[1]!.values as Array<{
      chartOfAccountsId: string
      debitCents: number
      creditCents: number
      description: string
      lineNumber: number
    }>
    expect(lines).toHaveLength(4) // 3 debits + 1 credit

    // Balance invariant — same as P1-08/P1-09 multi-line entries.
    const debits = lines.reduce((sum, l) => sum + l.debitCents, 0)
    const credits = lines.reduce((sum, l) => sum + l.creditCents, 0)
    expect(debits).toBe(475_000)
    expect(credits).toBe(475_000)

    const debitLines = lines.filter((l) => l.debitCents > 0)
    expect(debitLines).toHaveLength(3)
    // All debits hit owner_draws.
    expect(debitLines.every((l) => l.chartOfAccountsId === 'odraw-id')).toBe(true)

    // Each debit line has a kind-specific description.
    const descriptions = debitLines.map((l) => l.description)
    expect(descriptions.some((d) => d.includes('Federal'))).toBe(true)
    expect(descriptions.some((d) => d.includes('State'))).toBe(true)
    expect(descriptions.some((d) => d.includes('Self-employment'))).toBe(true)

    // Single credit hits cash.
    const creditLine = lines.find((l) => l.creditCents > 0)
    expect(creditLine?.chartOfAccountsId).toBe('cash-id')
    expect(creditLine?.creditCents).toBe(475_000)
  })

  it('skips zero-amount components — produces a 2-line entry when only federal paid', async () => {
    const tx = makeTx({ ownerDrawsId: 'odraw-id', cashId: 'cash-id' })

    await postTaxPaymentJournal(tx as never, {
      organizationId: 'org-1',
      taxEstimateId: 'est-1',
      entryDate: '2026-04-15',
      federalCents: 250_000,
      stateCents: 0,
      seCents: 0,
      paymentReference: 'EFTPS test',
      taxYear: 2026,
      taxQuarter: 1,
    })

    const lines = inserts[1]!.values as Array<{
      debitCents: number
      creditCents: number
    }>
    expect(lines).toHaveLength(2) // 1 debit + 1 credit (no zero-amount lines)

    const debits = lines.reduce((sum, l) => sum + l.debitCents, 0)
    const credits = lines.reduce((sum, l) => sum + l.creditCents, 0)
    expect(debits).toBe(250_000)
    expect(credits).toBe(250_000)
  })

  it('rejects zero total (no payment to record)', async () => {
    const tx = makeTx({ ownerDrawsId: 'odraw-id', cashId: 'cash-id' })

    await expect(
      postTaxPaymentJournal(tx as never, {
        organizationId: 'org-1',
        taxEstimateId: 'est-1',
        entryDate: '2026-04-15',
        federalCents: 0,
        stateCents: 0,
        seCents: 0,
        paymentReference: 'should fail',
        taxYear: 2026,
        taxQuarter: 1,
      }),
    ).rejects.toThrow(/total must be > 0/)
  })

  it('rejects negative components', async () => {
    const tx = makeTx({ ownerDrawsId: 'odraw-id', cashId: 'cash-id' })

    await expect(
      postTaxPaymentJournal(tx as never, {
        organizationId: 'org-1',
        taxEstimateId: 'est-1',
        entryDate: '2026-04-15',
        federalCents: 100_000,
        stateCents: -50_000,
        seCents: 0,
        paymentReference: 'should fail',
        taxYear: 2026,
        taxQuarter: 1,
      }),
    ).rejects.toThrow(/non-negative/)
  })
})
