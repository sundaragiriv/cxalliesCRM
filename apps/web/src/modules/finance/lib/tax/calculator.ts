/**
 * Pure quarterly tax estimate calculator.
 *
 * Annualized-income method (IRS Form 1040-ES simplification): annualize the
 * quarter's net income by × 4, compute full-year tax via brackets, divide by
 * 4 → this quarter's estimate. Handles progressive brackets correctly without
 * tracking YTD across quarters.
 *
 * Phase 1 simplification — does NOT subtract the standard deduction. The
 * estimate runs ~22% × $15K = $3.3K/year high for a single filer (the safe
 * direction for estimated taxes — overpaying avoids underpayment penalties).
 *
 * TODO P4-XX: tax_constants reference table for standard deduction, QBI,
 * retirement contributions, HSA, depreciation, itemization. Phase 1
 * estimates overshoot AGI-based slightly; full deduction model lands in a
 * focused Phase 4 ticket alongside QBI, retirement, etc. — all together,
 * all data-driven via tax_constants.
 */

export type FilingStatus =
  | 'single'
  | 'married_jointly'
  | 'married_separately'
  | 'head_of_household'

export interface TaxRateRow {
  taxKind:
    | 'federal_income'
    | 'state_income'
    | 'self_employment'
    | 'fica_ss'
    | 'fica_medicare'
    | 'medicare_additional'
  jurisdiction: string
  filingStatus: FilingStatus | null
  bracketLowCents: number | null
  bracketHighCents: number | null
  rateBasisPoints: number
}

export interface CalculatorInput {
  /** Cash-basis revenue received in the quarter. */
  grossIncomeCents: number
  /** Deductible business expenses in the quarter. */
  deductibleExpensesCents: number
  /** Filing status from organizations.defaultFilingStatus (default 'single'). */
  filingStatus: FilingStatus
  /** Two-letter state code; lowercase form drives jurisdiction lookup. */
  stateCode: string
  /** All tax_rates rows for this year. Calculator filters them itself. */
  rates: ReadonlyArray<TaxRateRow>
}

export interface CalculatorOutput {
  /** Quarter's net income (income - expenses). May be 0 or negative. */
  netSelfEmploymentCents: number
  /** Net SE × 0.9235. The figure SE tax is computed on (Schedule SE line 4). */
  taxableSelfEmploymentCents: number
  /** Quarterly self-employment tax (12.4% SS up to wage base + 2.9% Medicare uncapped). */
  selfEmploymentEstimateCents: number
  /** Federal taxable income for income-tax brackets (net - half_SE; no standard deduction in Phase 1). */
  federalTaxableIncomeCents: number
  /** Quarterly federal income tax. */
  federalEstimateCents: number
  /** Quarterly state income tax. 0 if no rates seeded for the state. */
  stateEstimateCents: number
  /** Sum of federal + state + SE. */
  totalEstimateCents: number
}

/**
 * Sum of `rateBasisPoints/10000 × portion-of-amount-in-bracket` across all
 * matching brackets. Tolerates open-ended top brackets (`bracketHighCents=null`)
 * and unbounded floors (`bracketLowCents=null`).
 *
 * Returns cents; rounds half-up to whole cents per IRS rounding convention.
 */
function applyBrackets(amountCents: number, brackets: ReadonlyArray<TaxRateRow>): number {
  if (amountCents <= 0) return 0
  let tax = 0
  for (const b of brackets) {
    const low = b.bracketLowCents ?? 0
    const high = b.bracketHighCents ?? Number.MAX_SAFE_INTEGER
    if (amountCents <= low) continue
    const taxableInThisBracket = Math.min(amountCents, high) - low
    if (taxableInThisBracket <= 0) continue
    tax += (taxableInThisBracket * b.rateBasisPoints) / 10000
  }
  return Math.round(tax)
}

function filterRates(
  rates: ReadonlyArray<TaxRateRow>,
  predicate: (r: TaxRateRow) => boolean,
): TaxRateRow[] {
  return rates.filter(predicate)
}

export function compute(input: CalculatorInput): CalculatorOutput {
  const netCents = input.grossIncomeCents - input.deductibleExpensesCents

  // ---- Self-employment tax (IRS Pub 334 / Schedule SE) ----
  // Schedule SE line 4: net × 0.9235 (this factor is the only valid value of
  // its kind in 30+ years of IRS forms; inlining here is intentional).
  const taxableSE = Math.max(0, Math.round(netCents * 0.9235))
  const seBrackets = filterRates(
    input.rates,
    (r) => r.taxKind === 'self_employment',
  )
  // Annualize → compute full-year SE tax → divide by 4 for quarterly estimate.
  const annualSEBase = taxableSE * 4
  const annualSETax = applyBrackets(annualSEBase, seBrackets)
  const seQuarterly = Math.round(annualSETax / 4)

  // ---- Federal income tax ----
  // Half of SE tax is deductible from AGI before federal income tax (IRS
  // Schedule 1 line 15). Apply at the annualized level for consistency.
  const halfAnnualSE = Math.round(annualSETax / 2)
  const annualNet = netCents * 4
  const annualFederalTaxable = Math.max(0, annualNet - halfAnnualSE)

  const federalBrackets = filterRates(
    input.rates,
    (r) =>
      r.taxKind === 'federal_income' &&
      (r.filingStatus === input.filingStatus || r.filingStatus === null),
  )
  const annualFederalTax = applyBrackets(annualFederalTaxable, federalBrackets)
  const federalQuarterly = Math.round(annualFederalTax / 4)

  // ---- State income tax ----
  // For Phase 1 single-state owner-operator: state taxable = annual net (no
  // SE half-deduction, no standard deduction). NC is flat 4.25%; bracket-based
  // states resolve via the same bracket logic.
  const stateJurisdiction = `us_${input.stateCode.toLowerCase()}`
  const stateBrackets = filterRates(
    input.rates,
    (r) =>
      r.taxKind === 'state_income' &&
      r.jurisdiction === stateJurisdiction &&
      (r.filingStatus === input.filingStatus || r.filingStatus === null),
  )
  const annualStateTaxable = Math.max(0, annualNet)
  const annualStateTax = applyBrackets(annualStateTaxable, stateBrackets)
  const stateQuarterly = Math.round(annualStateTax / 4)

  return {
    netSelfEmploymentCents: netCents,
    taxableSelfEmploymentCents: taxableSE,
    selfEmploymentEstimateCents: seQuarterly,
    federalTaxableIncomeCents: Math.max(0, netCents - Math.round(halfAnnualSE / 4)),
    federalEstimateCents: federalQuarterly,
    stateEstimateCents: stateQuarterly,
    totalEstimateCents: federalQuarterly + stateQuarterly + seQuarterly,
  }
}
