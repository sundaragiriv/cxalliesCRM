/**
 * Pure invoice line generator.
 *
 * Per conventions §3.13 — invoice lines snapshot description and unit price
 * from their source rows at generation time. Subsequent edits to the source
 * (e.g., a user fixing a typo on a time entry's description) do NOT rewrite
 * the invoice line. The verification script's headline test proves this.
 *
 * Phase 1 grouping: ONE invoice line per source entry. Most consulting
 * firms invoice this way ("Sprint planning — May 1 — 2.5h × $200"). Phase 4+
 * may add summary modes (per-day, per-project) as user-selectable.
 *
 * Multi-currency: all source entries must share `currency_code`. Mixed
 * currencies throw with a remediation message.
 */

export interface SourceTimeEntry {
  id: string
  entryDate: string
  description: string
  hoursText: string // numeric(5,2) — store as text to avoid float drift
  billableRateCents: number
  currencyCode: string
  projectId: string
}

export interface SourceExpenseEntry {
  id: string
  entryDate: string
  description: string
  amountCents: number
  currencyCode: string
  projectId: string | null
  /** The expense account it codes to — informational; doesn't drive the line's revenue account. */
  chartOfAccountsId: string
}

export interface InvoiceLineDraft {
  lineNumber: number
  kind: 'time' | 'expense' | 'fixed' | 'discount' | 'tax'
  description: string
  quantityText: string // numeric(10,2) — preserve precision
  unitPriceCents: number
  amountCents: number
  currencyCode: string
  /** Project id propagated from source for journal-post-time revenue lookup. */
  projectId: string | null
  /** Per-line CoA override; NULL means resolve at journal post via project's BL. */
  chartOfAccountsId: string | null
  /** Back-reference to the time entry, when sourced from one. */
  sourceTimeEntryId?: string
  /** Back-reference to the expense entry, when sourced from one. */
  sourceExpenseEntryId?: string
}

export class MultiCurrencyInvoiceError extends Error {
  constructor(public readonly currencies: string[]) {
    super(
      `Cannot generate invoice with mixed currencies. Period contains entries in ${currencies.join(', ')}; resolve by separating into different invoices.`,
    )
    this.name = 'MultiCurrencyInvoiceError'
  }
}

export interface GenerateInvoiceLinesOptions {
  timeEntries: ReadonlyArray<SourceTimeEntry>
  expenses: ReadonlyArray<SourceExpenseEntry>
}

export interface GenerateInvoiceLinesResult {
  lines: InvoiceLineDraft[]
  /** Single shared currency for the whole invoice. */
  currencyCode: string
  /** Sum of line amounts, in cents. */
  subtotalCents: number
  /** Min entry_date across sources, or null when no sources. */
  periodStart: string | null
  /** Max entry_date across sources, or null when no sources. */
  periodEnd: string | null
}

/**
 * Multiplies a numeric(N,2) text value by an integer cents amount, rounding
 * to whole cents per IRS / accounting convention. Avoids JS float arithmetic
 * on values that already came from numeric columns.
 *
 * Example: hoursText="2.50", rateCents=15000 → 37500 (= $375.00)
 */
function multiplyDecimalByCents(decimalText: string, rateCents: number): number {
  // numeric(5,2) and numeric(10,2) are at most 2 decimals; multiply by 100
  // to land on integer hundredths, then round-divide.
  const hundredths = Math.round(parseFloat(decimalText) * 100)
  if (!Number.isFinite(hundredths)) {
    throw new Error(`Invalid decimal: ${decimalText}`)
  }
  // hundredths × cents / 100 → cents. Math.round handles half-cent edge cases.
  return Math.round((hundredths * rateCents) / 100)
}

export function generateInvoiceLines(
  opts: GenerateInvoiceLinesOptions,
): GenerateInvoiceLinesResult {
  // ---- Multi-currency validation ----
  const currencies = new Set<string>()
  for (const t of opts.timeEntries) currencies.add(t.currencyCode)
  for (const e of opts.expenses) currencies.add(e.currencyCode)
  if (currencies.size > 1) {
    throw new MultiCurrencyInvoiceError(Array.from(currencies).sort())
  }
  // currencyCode resolves even for an empty period — caller must check empty
  // and not generate; we pick the first currency or default to USD for the
  // empty case.
  const currencyCode =
    [...currencies][0] ??
    opts.timeEntries[0]?.currencyCode ??
    opts.expenses[0]?.currencyCode ??
    'USD'

  // ---- Build lines (snapshot per §3.13) ----
  const lines: InvoiceLineDraft[] = []
  let lineNumber = 1

  // Time lines, ordered by entry_date asc.
  const timeOrdered = [...opts.timeEntries].sort((a, b) =>
    a.entryDate.localeCompare(b.entryDate),
  )
  for (const t of timeOrdered) {
    const amount = multiplyDecimalByCents(t.hoursText, t.billableRateCents)
    lines.push({
      lineNumber: lineNumber++,
      kind: 'time',
      description: t.description, // SNAPSHOT (§3.13)
      quantityText: t.hoursText,
      unitPriceCents: t.billableRateCents, // SNAPSHOT (§3.13) — already snapshotted at time-entry creation
      amountCents: amount,
      currencyCode,
      projectId: t.projectId,
      chartOfAccountsId: null, // resolve at journal-post via project's BL
      sourceTimeEntryId: t.id,
    })
  }

  // Expense lines, ordered by entry_date asc.
  const expenseOrdered = [...opts.expenses].sort((a, b) =>
    a.entryDate.localeCompare(b.entryDate),
  )
  for (const e of expenseOrdered) {
    lines.push({
      lineNumber: lineNumber++,
      kind: 'expense',
      description: e.description, // SNAPSHOT
      quantityText: '1.00',
      unitPriceCents: e.amountCents,
      amountCents: e.amountCents,
      currencyCode,
      projectId: e.projectId,
      chartOfAccountsId: null, // resolve at journal-post via project's BL
      sourceExpenseEntryId: e.id,
    })
  }

  // ---- Period span ----
  const allDates = [
    ...opts.timeEntries.map((t) => t.entryDate),
    ...opts.expenses.map((e) => e.entryDate),
  ].sort()
  const periodStart = allDates[0] ?? null
  const periodEnd = allDates[allDates.length - 1] ?? null

  const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0)

  return {
    lines,
    currencyCode,
    subtotalCents,
    periodStart,
    periodEnd,
  }
}
