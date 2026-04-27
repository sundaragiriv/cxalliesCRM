import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { taxRates } from '@/modules/finance/schema'

// Source: 2025 IRS Pub 15-T brackets used as 2026 placeholder. Update when IRS
// publishes 2026 finals. NC state rate from NCDOR 2025 (D-400 schedule).
const SOURCE_FED = 'https://www.irs.gov/pub/irs-pdf/p15t.pdf'
const SOURCE_FICA = 'https://www.irs.gov/businesses/small-businesses-self-employed/topic-no-751-social-security-and-medicare-withholding-rates'
const SOURCE_SE = 'https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes'
const SOURCE_NC = 'https://www.ncdor.gov/taxes-forms/individual-income-tax'

const TAX_YEAR = 2026
const EFFECTIVE_FROM = `${TAX_YEAR}-01-01`
const EFFECTIVE_TO = `${TAX_YEAR}-12-31`

// 2025 SS wage base: $176,100
const SS_WAGE_BASE_CENTS = 176_100_00

type Row = typeof taxRates.$inferInsert

const FEDERAL_INCOME_SINGLE: Row[] = [
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'single', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 0,           bracketHighCents: 11_925_00,  rateBasisPoints: 1000, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'single', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 11_925_00,  bracketHighCents: 48_475_00,  rateBasisPoints: 1200, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'single', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 48_475_00,  bracketHighCents: 103_350_00, rateBasisPoints: 2200, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'single', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 103_350_00, bracketHighCents: 197_300_00, rateBasisPoints: 2400, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'single', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 197_300_00, bracketHighCents: 250_525_00, rateBasisPoints: 3200, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'single', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 250_525_00, bracketHighCents: 626_350_00, rateBasisPoints: 3500, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'single', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 626_350_00, bracketHighCents: null,       rateBasisPoints: 3700, sourceUrl: SOURCE_FED },
]

const FEDERAL_INCOME_MARRIED_JOINTLY: Row[] = [
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'married_jointly', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 0,           bracketHighCents: 23_850_00,  rateBasisPoints: 1000, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'married_jointly', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 23_850_00,  bracketHighCents: 96_950_00,  rateBasisPoints: 1200, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'married_jointly', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 96_950_00,  bracketHighCents: 206_700_00, rateBasisPoints: 2200, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'married_jointly', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 206_700_00, bracketHighCents: 394_600_00, rateBasisPoints: 2400, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'married_jointly', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 394_600_00, bracketHighCents: 501_050_00, rateBasisPoints: 3200, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'married_jointly', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 501_050_00, bracketHighCents: 751_600_00, rateBasisPoints: 3500, sourceUrl: SOURCE_FED },
  { jurisdiction: 'us_federal', taxKind: 'federal_income', filingStatus: 'married_jointly', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 751_600_00, bracketHighCents: null,       rateBasisPoints: 3700, sourceUrl: SOURCE_FED },
]

const FICA_AND_SE: Row[] = [
  // FICA Social Security (employee portion): 6.2% up to wage base
  { jurisdiction: 'us_federal', taxKind: 'fica_ss',          filingStatus: null, effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 0, bracketHighCents: SS_WAGE_BASE_CENTS, rateBasisPoints: 620,  sourceUrl: SOURCE_FICA },
  // FICA Medicare (employee portion): 1.45% no cap
  { jurisdiction: 'us_federal', taxKind: 'fica_medicare',    filingStatus: null, effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 0, bracketHighCents: null,                rateBasisPoints: 145,  sourceUrl: SOURCE_FICA },
  // Additional Medicare 0.9% over threshold (single $200K)
  { jurisdiction: 'us_federal', taxKind: 'medicare_additional', filingStatus: 'single',          effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 200_000_00, bracketHighCents: null, rateBasisPoints: 90, sourceUrl: SOURCE_FICA },
  // Additional Medicare 0.9% over threshold (married_jointly $250K)
  { jurisdiction: 'us_federal', taxKind: 'medicare_additional', filingStatus: 'married_jointly', effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 250_000_00, bracketHighCents: null, rateBasisPoints: 90, sourceUrl: SOURCE_FICA },
  // Self-employment tax — Social Security portion: 12.4% up to wage base
  { jurisdiction: 'us_federal', taxKind: 'self_employment',  filingStatus: null, effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 0, bracketHighCents: SS_WAGE_BASE_CENTS, rateBasisPoints: 1240, sourceUrl: SOURCE_SE },
  // Self-employment tax — Medicare portion: 2.9% no cap
  { jurisdiction: 'us_federal', taxKind: 'self_employment',  filingStatus: null, effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 0, bracketHighCents: null,                rateBasisPoints: 290,  sourceUrl: SOURCE_SE },
]

const NC_STATE: Row[] = [
  // NC flat 4.25% (2025) used as 2026 placeholder. NC has been gradually reducing.
  { jurisdiction: 'us_nc', taxKind: 'state_income', filingStatus: null, effectiveYear: TAX_YEAR, effectiveFrom: EFFECTIVE_FROM, effectiveTo: EFFECTIVE_TO, bracketLowCents: 0, bracketHighCents: null, rateBasisPoints: 425, stateCode: 'NC', sourceUrl: SOURCE_NC },
]

const ALL_ROWS: Row[] = [
  ...FEDERAL_INCOME_SINGLE,
  ...FEDERAL_INCOME_MARRIED_JOINTLY,
  ...FICA_AND_SE,
  ...NC_STATE,
]

export async function seedTaxRates(): Promise<void> {
  // Idempotency: if any 2026 rates exist, assume seeded and exit. (Re-running
  // after a manual edit would otherwise duplicate rows; uniqueness across all
  // bracket dimensions is hard to express as a single UNIQUE INDEX.)
  const [existing] = await db
    .select({ id: taxRates.id })
    .from(taxRates)
    .where(eq(taxRates.effectiveYear, TAX_YEAR))
    .limit(1)

  if (existing) {
    return
  }

  await db.insert(taxRates).values(ALL_ROWS)
}
