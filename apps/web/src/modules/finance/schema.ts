import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  uuid,
  date,
  timestamp,
  boolean,
  integer,
  char,
  bigint,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core'
import {
  id,
  organizationId,
  standardLifecycle,
  timestamps,
  currencyCode,
  moneyCents,
  moneyCentsNullable,
} from '@/db/shared'
import {
  accountTypeEnum,
  paymentMethodEnum,
  paymentSourceEnum,
  paymentStatusEnum,
  cardOwnershipEnum,
  cardTypeEnum,
  taxKindEnum,
  filingStatusEnum,
  expenseReportStatusEnum,
} from '@/db/enums'
import { organizations, parties, businessLines } from '@/modules/parties/schema'
import { users } from '@/modules/auth/schema'
import { files } from '@/modules/files/schema'

// ============================================================================
// Operational tables (per-tenant)
// ============================================================================

/**
 * Chart of Accounts. Type-prefixed numeric scheme:
 *   1000-1999 Assets, 2000-2999 Liabilities, 3000-3999 Equity,
 *   4000-4999 Revenue, 5000-5999 Expenses, 6000-6999 COGS.
 *
 * Tenant data — fully editable per conventions §3.11. Sensible defaults
 * ship via finance_chart_of_accounts_templates and materialize through
 * applyChartOfAccountsTemplate() in finance/lib/apply-template.ts.
 */
export const chartOfAccounts = pgTable(
  'finance_chart_of_accounts',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    accountNumber: text('account_number').notNull(),
    accountName: text('account_name').notNull(),
    accountType: accountTypeEnum('account_type').notNull(),
    accountSubtype: text('account_subtype').notNull(),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    parentAccountId: uuid('parent_account_id'),
    isActive: boolean('is_active').notNull().default(true),
    description: text('description'),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('coa_org_number_unique').on(t.organizationId, t.accountNumber),
    typeIdx: index('coa_type_idx').on(t.accountType, t.isActive),
  }),
)

/**
 * Journal entries. Designed-for-double-entry; recorded in single-entry mode in Phase 1.
 * Append-only at the row level — reversals create new entries that point back via
 * reversed_journal_entry_id.
 */
export const journalEntries = pgTable(
  'finance_journal_entries',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entryDate: date('entry_date').notNull(),
    entryNumber: text('entry_number').notNull(),
    description: text('description').notNull(),
    sourceTable: text('source_table').notNull(),
    sourceId: uuid('source_id').notNull(),
    isReversal: boolean('is_reversal').notNull().default(false),
    reversedJournalEntryId: uuid('reversed_journal_entry_id'),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('je_org_number_unique').on(t.organizationId, t.entryNumber),
    sourceIdx: index('je_source_idx').on(t.sourceTable, t.sourceId),
    dateIdx: index('je_date_idx').on(t.entryDate),
  }),
)

/**
 * Journal lines. Append-only. Each line is debit-or-credit (CHECK enforces exclusivity).
 */
export const journalLines = pgTable(
  'finance_journal_lines',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    journalEntryId: uuid('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    chartOfAccountsId: uuid('chart_of_accounts_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    debitCents: bigint('debit_cents', { mode: 'number' }).notNull().default(0),
    creditCents: bigint('credit_cents', { mode: 'number' }).notNull().default(0),
    currencyCode: currencyCode(),
    description: text('description'),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    partyId: uuid('party_id').references(() => parties.id),
    lineNumber: integer('line_number').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    entryIdx: index('jl_entry_idx').on(t.journalEntryId),
    accountIdx: index('jl_account_idx').on(t.chartOfAccountsId),
    partyIdx: index('jl_party_idx').on(t.partyId),
    debitOrCredit: check(
      'jl_debit_xor_credit',
      sql`(${t.debitCents} > 0 AND ${t.creditCents} = 0) OR (${t.debitCents} = 0 AND ${t.creditCents} > 0)`,
    ),
  }),
)

/**
 * Revenue entries. One row per recognized revenue event.
 *
 * invoice_id and subscription_id are uuid NULL — FK constraints to billing tables
 * land in P1-08 once those tables exist.
 */
export const revenueEntries = pgTable(
  'finance_revenue_entries',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entryDate: date('entry_date').notNull(),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    partyId: uuid('party_id').references(() => parties.id),
    chartOfAccountsId: uuid('chart_of_accounts_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    description: text('description').notNull(),
    amountCents: moneyCents('amount_cents'),
    currencyCode: currencyCode(),
    paymentMethod: paymentMethodEnum('payment_method'),
    paymentStatus: paymentStatusEnum('payment_status').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    invoiceId: uuid('invoice_id'),
    subscriptionId: uuid('subscription_id'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    orgDateIdx: index('rev_org_date_idx').on(t.organizationId, t.entryDate),
    blIdx: index('rev_bl_idx').on(t.businessLineId, t.entryDate),
    partyIdx: index('rev_party_idx').on(t.partyId),
    statusIdx: index('rev_status_idx').on(t.paymentStatus),
  }),
)

/**
 * Expense entries. The most-touched table in Phase 1.
 * Tracks billable (pass-through) and reimbursable (employee-out-of-pocket) flags
 * independently. The "category" of an expense is the chart_of_accounts_id it
 * codes to — there is no separate expense category enum or table.
 */
export const expenseEntries = pgTable(
  'finance_expense_entries',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entryDate: date('entry_date').notNull(),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    chartOfAccountsId: uuid('chart_of_accounts_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    payeePartyId: uuid('payee_party_id').references(() => parties.id),
    description: text('description').notNull(),
    amountCents: moneyCents('amount_cents'),
    currencyCode: currencyCode(),
    paymentSource: paymentSourceEnum('payment_source').notNull(),
    corporateCardId: uuid('corporate_card_id'),
    isBillable: boolean('is_billable').notNull().default(false),
    isReimbursable: boolean('is_reimbursable').notNull().default(false),
    projectId: uuid('project_id'),
    expenseReportId: uuid('expense_report_id'),
    invoiceId: uuid('invoice_id'),
    submittedByUserId: uuid('submitted_by_user_id').references(() => users.id),
    receiptFileId: uuid('receipt_file_id').references(() => files.id),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    notes: text('notes'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgDateIdx: index('exp_org_date_idx').on(t.organizationId, t.entryDate),
    blDateIdx: index('exp_bl_date_idx').on(t.businessLineId, t.entryDate),
    projectDateIdx: index('exp_project_date_idx').on(t.projectId, t.entryDate),
    billableUnbilledIdx: index('exp_billable_unbilled_idx')
      .on(t.isBillable, t.invoiceId)
      .where(sql`${t.isBillable} = true AND ${t.invoiceId} IS NULL`),
    reimbursableUnreportedIdx: index('exp_reimb_unreported_idx')
      .on(t.isReimbursable, t.expenseReportId)
      .where(sql`${t.isReimbursable} = true AND ${t.expenseReportId} IS NULL`),
    submitterIdx: index('exp_submitter_idx').on(t.submittedByUserId),
  }),
)

/**
 * Expense reports — group expenses for reimbursement.
 */
export const expenseReports = pgTable(
  'finance_expense_reports',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    reportNumber: text('report_number').notNull(),
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id),
    subjectPartyId: uuid('subject_party_id').references(() => parties.id),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    projectId: uuid('project_id'),
    purpose: text('purpose').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: expenseReportStatusEnum('status').notNull(),
    totalCents: moneyCents('total_cents').default(0),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    reimbursedAt: timestamp('reimbursed_at', { withTimezone: true }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    reimbursedByUserId: uuid('reimbursed_by_user_id').references(() => users.id),
    reimbursementPaymentId: uuid('reimbursement_payment_id'),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('exp_rpt_org_number_unique').on(t.organizationId, t.reportNumber),
    submitterStatusIdx: index('exp_rpt_submitter_status_idx').on(t.submittedByUserId, t.status),
    statusIdx: index('exp_rpt_status_idx').on(t.status),
  }),
)

/**
 * Corporate cards. Tracks who holds it and ownership (business vs personal-with-business-use).
 */
export const corporateCards = pgTable(
  'finance_corporate_cards',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    nickname: text('nickname').notNull(),
    lastFour: char('last_four', { length: 4 }).notNull(),
    cardType: cardTypeEnum('card_type').notNull(),
    ownership: cardOwnershipEnum('ownership').notNull(),
    holderUserId: uuid('holder_user_id').references(() => users.id),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    holderIdx: index('cards_holder_idx').on(t.holderUserId),
    activeIdx: index('cards_active_idx').on(t.isActive),
  }),
)

/**
 * Quarterly tax estimates. Auto-recomputed on revenue/expense events for the period.
 * Tenant data (per-org).
 */
export const taxEstimates = pgTable(
  'finance_tax_estimates',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    taxYear: integer('tax_year').notNull(),
    taxQuarter: integer('tax_quarter').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    grossIncomeCents: moneyCents('gross_income_cents').default(0),
    deductibleExpensesCents: moneyCents('deductible_expenses_cents').default(0),
    taxableIncomeCents: moneyCents('taxable_income_cents').default(0),
    federalEstimateCents: moneyCents('federal_estimate_cents').default(0),
    stateEstimateCents: moneyCents('state_estimate_cents').default(0),
    selfEmploymentEstimateCents: moneyCents('self_employment_estimate_cents').default(0),
    totalEstimateCents: moneyCents('total_estimate_cents').default(0),
    dueDate: date('due_date').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paidAmountCents: moneyCentsNullable('paid_amount_cents'),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    quarterUnique: uniqueIndex('tax_est_quarter_unique').on(
      t.organizationId,
      t.taxYear,
      t.taxQuarter,
    ),
  }),
)

// ============================================================================
// Reference data (system-managed, shared across tenants — no organization_id)
// Per conventions §3.11.
// ============================================================================

/**
 * Tax rates. Jurisdictional reference data — federal brackets, FICA, Medicare,
 * NC state, etc. The same for every tenant filing in that jurisdiction in that year.
 * Tenant-specific overrides (rare) would land in a future tax_rate_overrides table.
 */
export const taxRates = pgTable(
  'finance_tax_rates',
  {
    id: id(),
    jurisdiction: text('jurisdiction').notNull(), // 'us_federal', 'us_nc', ...
    taxKind: taxKindEnum('tax_kind').notNull(),
    effectiveYear: integer('effective_year').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    bracketLowCents: moneyCentsNullable('bracket_low_cents'),
    bracketHighCents: moneyCentsNullable('bracket_high_cents'),
    filingStatus: filingStatusEnum('filing_status'),
    rateBasisPoints: integer('rate_basis_points').notNull(), // 2200 = 22.00%
    stateCode: char('state_code', { length: 2 }),
    sourceUrl: text('source_url'),
    ...standardLifecycle,
  },
  (t) => ({
    kindEffectiveIdx: index('tax_rates_kind_eff_idx').on(t.taxKind, t.effectiveFrom),
    yearJurisdictionIdx: index('tax_rates_year_jurisdiction_idx').on(
      t.effectiveYear,
      t.jurisdiction,
    ),
  }),
)

/**
 * Currencies — ISO 4217 reference data. System-shipped.
 */
export const currencies = pgTable('finance_currencies', {
  code: char('code', { length: 3 }).primaryKey(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  decimalDigits: integer('decimal_digits').notNull().default(2),
  isActive: boolean('is_active').notNull().default(true),
  ...standardLifecycle,
})

/**
 * Timezones — IANA TZ Database reference data. System-shipped.
 * Identifier is the IANA name (e.g., "America/New_York").
 */
export const timezones = pgTable('finance_timezones', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  utcOffsetText: text('utc_offset_text').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  ...standardLifecycle,
})

// ============================================================================
// CoA template tables (system-managed, shared across tenants)
// ============================================================================

/**
 * Chart-of-Accounts templates. System-managed reference data; ships with the
 * product. Tenants pick a template at onboarding (or accept the default) and
 * the template's lines are materialized into their finance_chart_of_accounts.
 */
export const chartOfAccountsTemplates = pgTable(
  'finance_chart_of_accounts_templates',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    targetPersona: text('target_persona'),
    isActive: boolean('is_active').notNull().default(true),
    ...standardLifecycle,
  },
  (t) => ({
    slugUnique: uniqueIndex('coa_templates_slug_unique').on(t.slug),
  }),
)

/**
 * The accounts that make up a CoA template. parent_account_number is a
 * self-reference by NUMBER (not FK) — apply-template resolves to actual
 * parent_account_id at materialization time.
 */
export const chartOfAccountsTemplateLines = pgTable(
  'finance_chart_of_accounts_template_lines',
  {
    id: id(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => chartOfAccountsTemplates.id, { onDelete: 'cascade' }),
    accountNumber: text('account_number').notNull(),
    accountName: text('account_name').notNull(),
    accountType: accountTypeEnum('account_type').notNull(),
    accountSubtype: text('account_subtype').notNull(),
    parentAccountNumber: text('parent_account_number'),
    description: text('description'),
    suggestedBusinessLineMatch: text('suggested_business_line_match'),
    displayOrder: integer('display_order').notNull().default(0),
    ...standardLifecycle,
  },
  (t) => ({
    templateAccountUnique: uniqueIndex('coa_template_lines_template_account_unique').on(
      t.templateId,
      t.accountNumber,
    ),
    templateOrderIdx: index('coa_template_lines_template_order_idx').on(
      t.templateId,
      t.displayOrder,
    ),
  }),
)

// ============================================================================
// Type exports
// ============================================================================

export type ChartOfAccount = typeof chartOfAccounts.$inferSelect
export type NewChartOfAccount = typeof chartOfAccounts.$inferInsert
export type JournalEntry = typeof journalEntries.$inferSelect
export type RevenueEntry = typeof revenueEntries.$inferSelect
export type ExpenseEntry = typeof expenseEntries.$inferSelect
export type NewExpenseEntry = typeof expenseEntries.$inferInsert
export type ExpenseReport = typeof expenseReports.$inferSelect
export type CorporateCard = typeof corporateCards.$inferSelect
export type TaxEstimate = typeof taxEstimates.$inferSelect
export type TaxRate = typeof taxRates.$inferSelect
export type Currency = typeof currencies.$inferSelect
export type Timezone = typeof timezones.$inferSelect
export type ChartOfAccountsTemplate = typeof chartOfAccountsTemplates.$inferSelect
export type ChartOfAccountsTemplateLine = typeof chartOfAccountsTemplateLines.$inferSelect
