/**
 * Display helper for money columns stored as integer cents.
 * Phase 1 ships USD only; multi-currency formatting lands when a non-USD
 * business line activates.
 */
export function formatMoney(cents: number, currency = 'USD'): string {
  const major = cents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major)
}

export function parseMoneyToCents(input: string): number {
  // Strip currency symbols, commas, spaces.
  const cleaned = input.replace(/[^\d.-]/g, '')
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed * 100)
}
