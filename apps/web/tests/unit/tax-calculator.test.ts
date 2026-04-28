import { describe, it, expect } from 'vitest'
import { compute, type TaxRateRow } from '@/modules/finance/lib/tax/calculator'

// 2026 federal brackets — single filer, from 11-tax-rates.ts seed (placeholder
// for 2025 IRS Pub 15-T values until 2026 finals are published).
const FED_SINGLE: TaxRateRow[] = [
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'single', bracketLowCents: 0,           bracketHighCents: 11_925_00,  rateBasisPoints: 1000 },
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'single', bracketLowCents: 11_925_00,  bracketHighCents: 48_475_00,  rateBasisPoints: 1200 },
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'single', bracketLowCents: 48_475_00,  bracketHighCents: 103_350_00, rateBasisPoints: 2200 },
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'single', bracketLowCents: 103_350_00, bracketHighCents: 197_300_00, rateBasisPoints: 2400 },
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'single', bracketLowCents: 197_300_00, bracketHighCents: 250_525_00, rateBasisPoints: 3200 },
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'single', bracketLowCents: 250_525_00, bracketHighCents: 626_350_00, rateBasisPoints: 3500 },
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'single', bracketLowCents: 626_350_00, bracketHighCents: null,        rateBasisPoints: 3700 },
]

const FED_MARRIED: TaxRateRow[] = [
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'married_jointly', bracketLowCents: 0,           bracketHighCents: 23_850_00,  rateBasisPoints: 1000 },
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'married_jointly', bracketLowCents: 23_850_00,  bracketHighCents: 96_950_00,  rateBasisPoints: 1200 },
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'married_jointly', bracketLowCents: 96_950_00,  bracketHighCents: 206_700_00, rateBasisPoints: 2200 },
  { taxKind: 'federal_income', jurisdiction: 'us_federal', filingStatus: 'married_jointly', bracketLowCents: 206_700_00, bracketHighCents: 394_600_00, rateBasisPoints: 2400 },
]

const SE: TaxRateRow[] = [
  { taxKind: 'self_employment', jurisdiction: 'us_federal', filingStatus: null, bracketLowCents: 0, bracketHighCents: 176_100_00, rateBasisPoints: 1240 },
  { taxKind: 'self_employment', jurisdiction: 'us_federal', filingStatus: null, bracketLowCents: 0, bracketHighCents: null,        rateBasisPoints: 290 },
]

const NC: TaxRateRow[] = [
  { taxKind: 'state_income', jurisdiction: 'us_nc', filingStatus: null, bracketLowCents: 0, bracketHighCents: null, rateBasisPoints: 425 },
]

const ALL_RATES = [...FED_SINGLE, ...FED_MARRIED, ...SE, ...NC]

describe('tax calculator — quarterly estimate', () => {
  it('returns zero on zero income', () => {
    const result = compute({
      grossIncomeCents: 0,
      deductibleExpensesCents: 0,
      filingStatus: 'single',
      stateCode: 'NC',
      rates: ALL_RATES,
    })
    expect(result.totalEstimateCents).toBe(0)
    expect(result.federalEstimateCents).toBe(0)
    expect(result.stateEstimateCents).toBe(0)
    expect(result.selfEmploymentEstimateCents).toBe(0)
  })

  it('returns zero when expenses exceed income (loss quarter)', () => {
    const result = compute({
      grossIncomeCents: 10_000_00,
      deductibleExpensesCents: 12_000_00,
      filingStatus: 'single',
      stateCode: 'NC',
      rates: ALL_RATES,
    })
    expect(result.totalEstimateCents).toBe(0)
  })

  // $50K AGI scenario: a quarter with $12.5K net (× 4 = $50K annualized).
  it('handles $50K AGI scenario for single filer in NC', () => {
    const result = compute({
      grossIncomeCents: 12_500_00,
      deductibleExpensesCents: 0,
      filingStatus: 'single',
      stateCode: 'NC',
      rates: ALL_RATES,
    })
    // Sanity bounds: total > 0, federal > 0, SE > 0
    expect(result.totalEstimateCents).toBeGreaterThan(0)
    expect(result.federalEstimateCents).toBeGreaterThan(0)
    expect(result.selfEmploymentEstimateCents).toBeGreaterThan(0)
    // NC flat 4.25% × $50K = $2,125/year → $531.25/qtr ≈ 53125¢
    expect(result.stateEstimateCents).toBe(53125)
    // SE: $50K × 0.9235 = $46,175. SS portion 12.4% on full (under cap)
    // = $5,725.70. Medicare 2.9% on full = $1,339.08. Total SE = $7,064.78/yr,
    // ÷ 4 = $1,766.20/qtr ≈ 176620¢ (rounded).
    expect(result.selfEmploymentEstimateCents).toBeGreaterThanOrEqual(176_500)
    expect(result.selfEmploymentEstimateCents).toBeLessThanOrEqual(177_000)
  })

  // $150K AGI scenario.
  it('handles $150K AGI scenario for single filer in NC', () => {
    const result = compute({
      grossIncomeCents: 37_500_00, // × 4 = $150K
      deductibleExpensesCents: 0,
      filingStatus: 'single',
      stateCode: 'NC',
      rates: ALL_RATES,
    })
    // NC flat 4.25% × $150K = $6,375/year → $1,593.75/qtr = 159375¢
    expect(result.stateEstimateCents).toBe(159375)
    // Federal should be in the 22%/24% bracket range — meaningful tax.
    expect(result.federalEstimateCents).toBeGreaterThan(500_000) // > $5K/qtr
    // SE remains under SS cap → full 15.3% effective on $150K × 0.9235.
    expect(result.selfEmploymentEstimateCents).toBeGreaterThan(490_000)
  })

  // $500K AGI — well over SS wage base ($176.1K), Additional Medicare territory
  // (0.9% over $200K single but our calculator doesn't include it yet — bracket
  // not in the seeded SE rates). Verifies the bracketed SS cap behavior.
  it('caps SS portion of SE tax at the wage base for $500K AGI', () => {
    const result = compute({
      grossIncomeCents: 125_000_00, // × 4 = $500K
      deductibleExpensesCents: 0,
      filingStatus: 'single',
      stateCode: 'NC',
      rates: ALL_RATES,
    })
    // Net SE = $500K × 0.9235 = $461,750.
    // SS 12.4% × $176,100 (capped) = $21,836.40
    // Medicare 2.9% × $461,750 = $13,390.75
    // Total SE = $35,227.15/yr ÷ 4 = $8,806.79/qtr ≈ 880_679¢
    expect(result.selfEmploymentEstimateCents).toBeGreaterThan(870_000)
    expect(result.selfEmploymentEstimateCents).toBeLessThan(890_000)
  })

  it('honors filing status — married_jointly has wider brackets ⇒ less federal at same AGI', () => {
    const single = compute({
      grossIncomeCents: 25_000_00, // $100K annualized
      deductibleExpensesCents: 0,
      filingStatus: 'single',
      stateCode: 'NC',
      rates: ALL_RATES,
    })
    const married = compute({
      grossIncomeCents: 25_000_00,
      deductibleExpensesCents: 0,
      filingStatus: 'married_jointly',
      stateCode: 'NC',
      rates: ALL_RATES,
    })
    expect(married.federalEstimateCents).toBeLessThan(single.federalEstimateCents)
    // SE and state don't depend on filing status here.
    expect(married.selfEmploymentEstimateCents).toBe(single.selfEmploymentEstimateCents)
    expect(married.stateEstimateCents).toBe(single.stateEstimateCents)
  })

  it('returns zero state tax for a state with no rates seeded', () => {
    const result = compute({
      grossIncomeCents: 25_000_00,
      deductibleExpensesCents: 0,
      filingStatus: 'single',
      stateCode: 'CA', // no us_ca rates in our test fixture
      rates: ALL_RATES,
    })
    expect(result.stateEstimateCents).toBe(0)
    // Federal + SE still computed.
    expect(result.federalEstimateCents).toBeGreaterThan(0)
    expect(result.selfEmploymentEstimateCents).toBeGreaterThan(0)
  })

  it('subtracts expenses from income before computing all three taxes', () => {
    const noExpenses = compute({
      grossIncomeCents: 25_000_00,
      deductibleExpensesCents: 0,
      filingStatus: 'single',
      stateCode: 'NC',
      rates: ALL_RATES,
    })
    const withExpenses = compute({
      grossIncomeCents: 25_000_00,
      deductibleExpensesCents: 5_000_00,
      filingStatus: 'single',
      stateCode: 'NC',
      rates: ALL_RATES,
    })
    expect(withExpenses.totalEstimateCents).toBeLessThan(noExpenses.totalEstimateCents)
    expect(withExpenses.stateEstimateCents).toBeLessThan(noExpenses.stateEstimateCents)
  })
})
