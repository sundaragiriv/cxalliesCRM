import { describe, it, expect, vi, beforeEach } from 'vitest'

type Insert = { table: unknown; values: unknown }
const inserts: Insert[] = []

function makeTx(opts: { arAccountId: string; revenueAccountByBL: Record<string, string> }) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
          limit: async () => {
            // We can't differentiate calls cleanly in a generic mock; the
            // tests below pass `chartOfAccountsId` on every line so the
            // journal helper never calls findRevenueAccountForBusinessLine
            // for the test case. findSystemAccount('ar_default') is the
            // only lookup that hits this path → return arAccountId.
            return [{ id: opts.arAccountId }]
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

const { postInvoiceJournal } = await import(
  '@/modules/finance/lib/journal/post-invoice'
)

describe('postInvoiceJournal', () => {
  beforeEach(() => {
    inserts.length = 0
  })

  it('posts a balanced 1+N entry: 1 debit AR + 1 credit when all lines share the same revenue account', async () => {
    const tx = makeTx({ arAccountId: 'ar-id', revenueAccountByBL: {} })

    const result = await postInvoiceJournal(tx as never, {
      organizationId: 'org-1',
      invoiceId: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      entryDate: '2026-04-30',
      totalCents: 100_000,
      currencyCode: 'USD',
      billToPartyId: 'party-1',
      invoiceBusinessLineId: 'bl-consulting',
      lines: [
        {
          id: 'l1',
          amountCents: 60_000,
          chartOfAccountsId: 'rev-consulting',
          projectBusinessLineId: 'bl-consulting',
          description: 'Sprint A',
        },
        {
          id: 'l2',
          amountCents: 40_000,
          chartOfAccountsId: 'rev-consulting',
          projectBusinessLineId: 'bl-consulting',
          description: 'Sprint B',
        },
      ],
    })

    expect(result.totalCents).toBe(100_000)
    expect(inserts).toHaveLength(2) // 1 entry + 1 batched lines

    const lines = inserts[1]!.values as Array<{
      chartOfAccountsId: string
      debitCents: number
      creditCents: number
    }>
    expect(lines).toHaveLength(2) // 1 debit + 1 grouped credit

    const debits = lines.reduce((s, l) => s + l.debitCents, 0)
    const credits = lines.reduce((s, l) => s + l.creditCents, 0)
    expect(debits).toBe(100_000)
    expect(credits).toBe(100_000)

    // Debit hits AR.
    const debit = lines.find((l) => l.debitCents > 0)
    expect(debit?.chartOfAccountsId).toBe('ar-id')

    // Credit hits the user-supplied revenue account.
    const credit = lines.find((l) => l.creditCents > 0)
    expect(credit?.chartOfAccountsId).toBe('rev-consulting')
    expect(credit?.creditCents).toBe(100_000)
  })

  it('posts 1+2 lines when invoice spans two revenue accounts', async () => {
    const tx = makeTx({ arAccountId: 'ar-id', revenueAccountByBL: {} })

    await postInvoiceJournal(tx as never, {
      organizationId: 'org-1',
      invoiceId: 'inv-2',
      invoiceNumber: 'INV-2026-0002',
      entryDate: '2026-04-30',
      totalCents: 75_000,
      currencyCode: 'USD',
      billToPartyId: 'party-1',
      invoiceBusinessLineId: 'bl-mixed',
      lines: [
        {
          id: 'l1',
          amountCents: 50_000,
          chartOfAccountsId: 'rev-consulting',
          projectBusinessLineId: 'bl-consulting',
          description: 'Time',
        },
        {
          id: 'l2',
          amountCents: 25_000,
          chartOfAccountsId: 'rev-product',
          projectBusinessLineId: 'bl-product',
          description: 'Subscription',
        },
      ],
    })

    const lines = inserts[1]!.values as Array<{
      chartOfAccountsId: string
      debitCents: number
      creditCents: number
    }>
    expect(lines).toHaveLength(3) // 1 debit + 2 credits

    const debits = lines.reduce((s, l) => s + l.debitCents, 0)
    const credits = lines.reduce((s, l) => s + l.creditCents, 0)
    expect(debits).toBe(75_000)
    expect(credits).toBe(75_000)

    const consultingCredit = lines.find(
      (l) => l.chartOfAccountsId === 'rev-consulting',
    )
    const productCredit = lines.find(
      (l) => l.chartOfAccountsId === 'rev-product',
    )
    expect(consultingCredit?.creditCents).toBe(50_000)
    expect(productCredit?.creditCents).toBe(25_000)
  })

  it('rejects empty lines or zero total', async () => {
    const tx = makeTx({ arAccountId: 'ar-id', revenueAccountByBL: {} })

    await expect(
      postInvoiceJournal(tx as never, {
        organizationId: 'org-1',
        invoiceId: 'inv-3',
        invoiceNumber: 'INV-2026-0003',
        entryDate: '2026-04-30',
        totalCents: 100,
        currencyCode: 'USD',
        billToPartyId: 'party-1',
        invoiceBusinessLineId: 'bl-1',
        lines: [],
      }),
    ).rejects.toThrow(/no lines/)

    await expect(
      postInvoiceJournal(tx as never, {
        organizationId: 'org-1',
        invoiceId: 'inv-4',
        invoiceNumber: 'INV-2026-0004',
        entryDate: '2026-04-30',
        totalCents: 0,
        currencyCode: 'USD',
        billToPartyId: 'party-1',
        invoiceBusinessLineId: 'bl-1',
        lines: [
          {
            id: 'l1',
            amountCents: 0,
            chartOfAccountsId: 'rev-1',
            projectBusinessLineId: 'bl-1',
            description: '',
          },
        ],
      }),
    ).rejects.toThrow(/total must be > 0/)
  })

  it('rejects when sum of lines does not equal total', async () => {
    const tx = makeTx({ arAccountId: 'ar-id', revenueAccountByBL: {} })

    await expect(
      postInvoiceJournal(tx as never, {
        organizationId: 'org-1',
        invoiceId: 'inv-5',
        invoiceNumber: 'INV-2026-0005',
        entryDate: '2026-04-30',
        totalCents: 100_000, // claims $1000
        currencyCode: 'USD',
        billToPartyId: 'party-1',
        invoiceBusinessLineId: 'bl-1',
        lines: [
          {
            id: 'l1',
            amountCents: 60_000, // but lines only sum to $600
            chartOfAccountsId: 'rev-1',
            projectBusinessLineId: 'bl-1',
            description: '',
          },
        ],
      }),
    ).rejects.toThrow(/balance mismatch/)
  })
})
