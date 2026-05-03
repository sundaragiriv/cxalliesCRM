import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  uuid,
  date,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
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
  projectStatusEnum,
  timeEntryStatusEnum,
  timesheetStatusEnum,
  invoiceStatusEnum,
  invoiceLineKindEnum,
  paymentMethodEnum,
  billingPeriodEnum,
  subscriptionStatusEnum,
  subscriptionEventKindEnum,
} from '@/db/enums'
import { organizations, parties, businessLines } from '@/modules/parties/schema'
import { users } from '@/modules/auth/schema'
import { files } from '@/modules/files/schema'
import { chartOfAccounts } from '@/modules/finance/schema'

// ============================================================================
// Subscription plans + subscriptions (no intra-module dependencies; declared
// first so subscriptions can FK back to plans cleanly).
// ============================================================================

export const subscriptionPlans = pgTable(
  'billing_subscription_plans',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    priceCents: moneyCents('price_cents'),
    currencyCode: currencyCode(),
    billingPeriod: billingPeriodEnum('billing_period').notNull(),
    trialDays: integer('trial_days').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    features: jsonb('features').notNull().default(sql`'[]'::jsonb`),
    description: text('description'),
    ...standardLifecycle,
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('sub_plans_org_slug_unique').on(
      t.organizationId,
      t.slug,
    ),
    blIdx: index('sub_plans_bl_idx').on(t.businessLineId, t.isActive),
  }),
)

export const subscriptions = pgTable(
  'billing_subscriptions',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    subscriberPartyId: uuid('subscriber_party_id')
      .notNull()
      .references(() => parties.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
    status: subscriptionStatusEnum('status').notNull(),
    currentPeriodStart: date('current_period_start').notNull(),
    currentPeriodEnd: date('current_period_end').notNull(),
    trialEndsAt: date('trial_ends_at'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    autoRenew: boolean('auto_renew').notNull().default(true),
    externalSubscriptionId: text('external_subscription_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    subscriberIdx: index('sub_subscriber_idx').on(t.subscriberPartyId),
    renewalIdx: index('sub_renewal_idx').on(t.status, t.currentPeriodEnd),
  }),
)

/**
 * Append-only lifecycle log. Per data-model §5.10 — distinct from `activities`
 * because subscription history needs structured replay (downgrade history,
 * renewal failures).
 */
export const subscriptionEvents = pgTable(
  'billing_subscription_events',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    eventKind: subscriptionEventKindEnum('event_kind').notNull(),
    fromPlanId: uuid('from_plan_id').references(() => subscriptionPlans.id),
    toPlanId: uuid('to_plan_id').references(() => subscriptionPlans.id),
    triggeredByUserId: uuid('triggered_by_user_id').references(() => users.id),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    subscriptionIdx: index('sub_events_subscription_idx').on(
      t.subscriptionId,
      t.createdAt,
    ),
  }),
)

/**
 * Memberships — non-recurring access grants. Phase 1: empty table; Phase 5+
 * surfaces it via subscription / lifetime-tier flows.
 */
export const memberships = pgTable(
  'billing_memberships',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    memberPartyId: uuid('member_party_id')
      .notNull()
      .references(() => parties.id),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    tier: text('tier').notNull(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    memberIdx: index('mem_member_idx').on(t.memberPartyId),
    blTierIdx: index('mem_bl_tier_idx').on(t.businessLineId, t.tier),
  }),
)

// ============================================================================
// Projects
//
// `contract_id` is a plain uuid here — the FK to crm_contracts lands in the
// hand-written 0017 cross-module migration to avoid a circular module import
// between billing/schema.ts and crm/schema.ts at TS module-load time.
// ============================================================================

export const projects = pgTable(
  'billing_projects',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    projectNumber: text('project_number').notNull(),
    name: text('name').notNull(),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    contractId: uuid('contract_id'), // FK → crm_contracts.id added in 0017
    endClientPartyId: uuid('end_client_party_id').references(() => parties.id),
    vendorPartyId: uuid('vendor_party_id').references(() => parties.id),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: projectStatusEnum('status').notNull(),
    defaultBillableRateCents: moneyCentsNullable('default_billable_rate_cents'),
    currencyCode: currencyCode(),
    budgetHours: numeric('budget_hours', { precision: 10, scale: 2 }),
    description: text('description'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('projects_org_number_unique').on(
      t.organizationId,
      t.projectNumber,
    ),
    blStatusIdx: index('projects_bl_status_idx').on(t.businessLineId, t.status),
    endClientIdx: index('projects_end_client_idx').on(
      t.endClientPartyId,
      t.status,
    ),
    contractIdx: index('projects_contract_idx').on(t.contractId),
  }),
)

// ============================================================================
// Timesheets (declared before time_entries since time_entries.timesheet_id
// references it — drizzle handles the lazy callback either way, but
// declaring in dep order keeps the generated SQL clean).
// ============================================================================

export const timesheets = pgTable(
  'billing_timesheets',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id),
    weekStarting: date('week_starting').notNull(),
    status: timesheetStatusEnum('status').notNull(),
    totalHours: numeric('total_hours', { precision: 7, scale: 2 })
      .notNull()
      .default('0'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    rejectionReason: text('rejection_reason'),
    ...standardLifecycle,
  },
  (t) => ({
    weekUnique: uniqueIndex('timesheets_week_unique').on(
      t.organizationId,
      t.submittedByUserId,
      t.weekStarting,
    ),
    statusIdx: index('timesheets_status_idx').on(t.status, t.weekStarting),
  }),
)

// ============================================================================
// Invoices + invoice_lines (declared before time_entries because time_entries
// FKs invoice_line_id; that intra-module forward-ref is added in 0016 since
// it's circular — projects → invoice_lines → invoice_lines.project_id → projects).
// ============================================================================

export const invoices = pgTable(
  'billing_invoices',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    invoiceNumber: text('invoice_number').notNull(),
    billToPartyId: uuid('bill_to_party_id')
      .notNull()
      .references(() => parties.id),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    projectId: uuid('project_id').references(() => projects.id),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    currencyCode: currencyCode(),
    subtotalCents: moneyCents('subtotal_cents').default(0),
    taxCents: moneyCents('tax_cents').default(0),
    totalCents: moneyCents('total_cents').default(0),
    paidCents: moneyCents('paid_cents').default(0),
    status: invoiceStatusEnum('status').notNull(),
    pdfFileId: uuid('pdf_file_id').references(() => files.id),
    pdfVersion: integer('pdf_version').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    terms: text('terms'),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('invoices_org_number_unique').on(
      t.organizationId,
      t.invoiceNumber,
    ),
    billToStatusIdx: index('invoices_billto_status_idx').on(
      t.billToPartyId,
      t.status,
    ),
    blStatusIdx: index('invoices_bl_status_idx').on(t.businessLineId, t.status),
    dueDateIdx: index('invoices_due_idx').on(t.dueDate, t.status),
  }),
)

export const invoiceLines = pgTable(
  'billing_invoice_lines',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    description: text('description').notNull(),
    kind: invoiceLineKindEnum('kind').notNull(),
    projectId: uuid('project_id').references(() => projects.id),
    quantity: numeric('quantity', { precision: 10, scale: 2 })
      .notNull()
      .default('1'),
    unitPriceCents: moneyCents('unit_price_cents'),
    amountCents: moneyCents('amount_cents'),
    currencyCode: currencyCode(),
    taxRateBasisPoints: integer('tax_rate_basis_points'),
    /**
     * Per-line revenue account override. NULL means resolve at journal-post
     * time from the line's project → business_line → CoA revenue account.
     * Required (non-NULL) for manual lines (kind='fixed') with no project.
     * P1-13 / §3.13.
     */
    chartOfAccountsId: uuid('chart_of_accounts_id').references(
      () => chartOfAccounts.id,
    ),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => ({
    invoiceLineIdx: uniqueIndex('inv_lines_invoice_line_unique').on(
      t.invoiceId,
      t.lineNumber,
    ),
    projectIdx: index('inv_lines_project_idx').on(t.projectId),
  }),
)

// ============================================================================
// Time entries — references projects + timesheets + invoice_lines.
// invoice_line_id FK uses the lazy callback so it works after invoiceLines
// has been declared above.
// ============================================================================

export const timeEntries = pgTable(
  'billing_time_entries',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id),
    entryDate: date('entry_date').notNull(),
    hours: numeric('hours', { precision: 5, scale: 2 }).notNull(),
    description: text('description').notNull(),
    billableRateCents: moneyCents('billable_rate_cents'),
    currencyCode: currencyCode(),
    status: timeEntryStatusEnum('status').notNull(),
    timesheetId: uuid('timesheet_id').references(() => timesheets.id),
    invoiceLineId: uuid('invoice_line_id').references(() => invoiceLines.id),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    projectDateIdx: index('time_project_date_idx').on(t.projectId, t.entryDate),
    submitterDateIdx: index('time_submitter_date_idx').on(
      t.submittedByUserId,
      t.entryDate,
    ),
    statusIdx: index('time_status_idx').on(t.status),
    timesheetIdx: index('time_timesheet_idx').on(t.timesheetId),
    /**
     * Partial unique on (org, project, user, entry_date) WHERE deleted_at IS NULL.
     * Enforces "one active time entry per (project, user, day)" — the grid-cell
     * invariant. Soft-deleted rows can repeat. UPSERT in createTimeEntry uses
     * this to insert-or-update the cell row.
     */
    activeOneCellUnique: uniqueIndex('time_active_one_cell_unique')
      .on(t.organizationId, t.projectId, t.submittedByUserId, t.entryDate)
      .where(sql`${t.deletedAt} IS NULL`),
  }),
)

// ============================================================================
// Payments + payment_applications.
//
// `revenue_entry_id` is a plain uuid here — FK to finance_revenue_entries
// lands in 0017 (cross-module). The data-model author's note about this
// being a suspect modeling choice stands; column nullable, redesign deferred.
// ============================================================================

export const payments = pgTable(
  'billing_payments',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    paymentNumber: text('payment_number').notNull(),
    fromPartyId: uuid('from_party_id')
      .notNull()
      .references(() => parties.id),
    paymentDate: date('payment_date').notNull(),
    amountCents: moneyCents('amount_cents'),
    currencyCode: currencyCode(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    reference: text('reference'),
    notes: text('notes'),
    revenueEntryId: uuid('revenue_entry_id'), // FK → finance_revenue_entries.id added in 0017
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('payments_org_number_unique').on(
      t.organizationId,
      t.paymentNumber,
    ),
    fromPartyIdx: index('payments_from_party_idx').on(t.fromPartyId, t.paymentDate),
    dateIdx: index('payments_date_idx').on(t.paymentDate),
  }),
)

export const paymentApplications = pgTable(
  'billing_payment_applications',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    appliedCents: moneyCents('applied_cents'),
    currencyCode: currencyCode(),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    paymentIdx: index('pay_app_payment_idx').on(t.paymentId),
    invoiceIdx: index('pay_app_invoice_idx').on(t.invoiceId),
  }),
)

// ============================================================================
// Type exports
// ============================================================================

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type TimeEntry = typeof timeEntries.$inferSelect
export type NewTimeEntry = typeof timeEntries.$inferInsert
export type Timesheet = typeof timesheets.$inferSelect
export type Invoice = typeof invoices.$inferSelect
export type InvoiceLine = typeof invoiceLines.$inferSelect
export type Payment = typeof payments.$inferSelect
export type PaymentApplication = typeof paymentApplications.$inferSelect
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect
export type Subscription = typeof subscriptions.$inferSelect
export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect
export type Membership = typeof memberships.$inferSelect
