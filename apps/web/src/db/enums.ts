import { pgEnum } from 'drizzle-orm/pg-core'

// === parties module ===
export const partyKindEnum = pgEnum('party_kind', ['person', 'organization'])

export const partyRoleEnum = pgEnum('party_role', [
  'vendor',
  'end_client',
  'customer',
  'lead',
  'partner',
  'employee',
  'contractor',
  'supplier',
])

export const partyRelationshipKindEnum = pgEnum('party_relationship_kind', [
  'works_at',
  'spouse_of',
  'manages',
  'subsidiary_of',
  'partner_of',
  'other',
])

export const businessLineKindEnum = pgEnum('business_line_kind', [
  'services',
  'subscription',
  'ad_revenue',
  'product',
  'other',
])

export const addressKindEnum = pgEnum('address_kind', [
  'billing',
  'shipping',
  'home',
  'office',
  'other',
])

export const customFieldTypeEnum = pgEnum('custom_field_type', [
  'text',
  'number',
  'date',
  'boolean',
  'select',
  'multiselect',
])

// === auth module ===
export const oauthProviderEnum = pgEnum('oauth_provider', ['google', 'microsoft'])

// === files module ===
export const fileKindEnum = pgEnum('file_kind', ['r2_owned', 'drive_linked'])

// === finance module ===
export const accountTypeEnum = pgEnum('account_type', [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
  'cogs',
])

export const paymentMethodEnum = pgEnum('payment_method', [
  'check',
  'ach',
  'wire',
  'card',
  'cash',
  'other',
])

export const paymentSourceEnum = pgEnum('payment_source', [
  'business_card',
  'personal_card_business_use',
  'personal_cash',
  'business_check',
  'business_ach',
  'vendor_paid',
])

export const cardOwnershipEnum = pgEnum('card_ownership', [
  'business_owned',
  'personal_with_business_use',
])

export const cardTypeEnum = pgEnum('card_type', [
  'visa',
  'mastercard',
  'amex',
  'discover',
  'other',
])

export const taxKindEnum = pgEnum('tax_kind', [
  'federal_income',
  'state_income',
  'self_employment',
  'fica_ss',
  'fica_medicare',
  'medicare_additional',
])

export const filingStatusEnum = pgEnum('filing_status', [
  'single',
  'married_jointly',
  'married_separately',
  'head_of_household',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'expected',
  'received',
  'failed',
  'refunded',
])

export const expenseReportStatusEnum = pgEnum('expense_report_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'reimbursed',
])

// === billing module ===
export const projectStatusEnum = pgEnum('project_status', [
  'planned',
  'active',
  'on_hold',
  'completed',
  'canceled',
])

export const timeEntryStatusEnum = pgEnum('time_entry_status', [
  'draft',
  'submitted',
  'approved',
  'invoiced',
  'rejected',
])

export const timesheetStatusEnum = pgEnum('timesheet_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
])

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  'canceled',
])

export const invoiceLineKindEnum = pgEnum('invoice_line_kind', [
  'time',
  'expense',
  'fixed',
  'discount',
  'tax',
])

export const billingPeriodEnum = pgEnum('billing_period', [
  'monthly',
  'quarterly',
  'annual',
  'lifetime',
])

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
  'paused',
])

export const subscriptionEventKindEnum = pgEnum('subscription_event_kind', [
  'created',
  'trial_started',
  'trial_ended',
  'activated',
  'renewed',
  'upgraded',
  'downgraded',
  'paused',
  'resumed',
  'canceled',
  'expired',
  'reactivated',
  'payment_failed',
  'payment_succeeded',
])

// === crm module ===
export const dealStageKindEnum = pgEnum('deal_stage_kind', ['open', 'won', 'lost'])

export const contractStatusEnum = pgEnum('contract_status', [
  'draft',
  'sent',
  'signed',
  'active',
  'expired',
  'renewed',
  'terminated',
])

// === hr module ===
export const employeeClassificationEnum = pgEnum('employee_classification', [
  'w2',
  '1099_contractor',
  'owner_employee',
])

export const employeeStatusEnum = pgEnum('employee_status', [
  'active',
  'on_leave',
  'terminated',
])

export const payFrequencyEnum = pgEnum('pay_frequency', [
  'weekly',
  'biweekly',
  'semi_monthly',
  'monthly',
])

export const payRateKindEnum = pgEnum('pay_rate_kind', ['hourly', 'salary'])

// === reporting module ===
export const tileKindEnum = pgEnum('tile_kind', [
  'kpi',
  'line_chart',
  'bar_chart',
  'table',
  'list',
  'project_health',
])

// === ai module ===
export const aiRunStatusEnum = pgEnum('ai_run_status', [
  'success',
  'error',
  'rate_limited',
])

export const aiSuggestionStatusEnum = pgEnum('ai_suggestion_status', [
  'pending',
  'accepted',
  'rejected',
  'expired',
])

// === shared ===
export const auditActionEnum = pgEnum('audit_action', [
  'insert',
  'update',
  'delete',
  'soft_delete',
  'restore',
])
