import { describe, it, expect, vi, beforeEach } from 'vitest'

type Insert = { table: unknown; values: unknown }
const inserts: Insert[] = []
let roleCallCount = 0

function makeTx(opts: { cashId: string; arId: string }) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
          limit: async () => {
            // Promise.all order in postPaymentJournal: cash_operating first, ar_default second.
            roleCallCount += 1
            return roleCallCount === 1
              ? [{ id: opts.cashId }]
              : [{ id: opts.arId }]
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

const { postPaymentJournal } = await import(
  '@/modules/finance/lib/journal/post-payment'
)

describe('postPaymentJournal', () => {
  beforeEach(() => {
    inserts.length = 0
    roleCallCount = 0
  })

  it('posts a balanced 2-line entry: DEBIT cash_operating, CREDIT ar_default', async () => {
    const tx = makeTx({ cashId: 'cash-id', arId: 'ar-id' })

    const result = await postPaymentJournal(tx as never, {
      organizationId: 'org-1',
      paymentId: 'pay-1',
      paymentNumber: 'PAY-2026-0001',
      entryDate: '2026-04-30',
      amountCents: 100_000,
      currencyCode: 'USD',
      fromPartyId: 'party-1',
      businessLineId: 'bl-consulting',
      appliedToInvoiceNumbers: ['INV-2026-0001'],
    })

    expect(result.entryNumber).toBe('JE-2026-0001')
    expect(inserts).toHaveLength(2)

    const lines = inserts[1]!.values as Array<{
      chartOfAccountsId: string
      debitCents: number
      creditCents: number
    }>
    expect(lines).toHaveLength(2)

    const debits = lines.reduce((s, l) => s + l.debitCents, 0)
    const credits = lines.reduce((s, l) => s + l.creditCents, 0)
    expect(debits).toBe(100_000)
    expect(credits).toBe(100_000)

    const debit = lines.find((l) => l.debitCents > 0)
    expect(debit?.chartOfAccountsId).toBe('cash-id')

    const credit = lines.find((l) => l.creditCents > 0)
    expect(credit?.chartOfAccountsId).toBe('ar-id')
  })

  it('rejects zero or negative amounts', async () => {
    const tx = makeTx({ cashId: 'cash-id', arId: 'ar-id' })

    await expect(
      postPaymentJournal(tx as never, {
        organizationId: 'org-1',
        paymentId: 'pay-1',
        paymentNumber: 'PAY-X',
        entryDate: '2026-04-30',
        amountCents: 0,
        currencyCode: 'USD',
        fromPartyId: 'party-1',
        businessLineId: null,
        appliedToInvoiceNumbers: [],
      }),
    ).rejects.toThrow(/amount must be > 0/)
  })
})
