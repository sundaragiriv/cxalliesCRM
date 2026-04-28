import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  uuid,
  date,
  timestamp,
  boolean,
  integer,
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
import { dealStageKindEnum, contractStatusEnum } from '@/db/enums'
import { organizations, parties, businessLines } from '@/modules/parties/schema'
import { users } from '@/modules/auth/schema'
import { files } from '@/modules/files/schema'

// ============================================================================
// Reference tables (system-managed, no organization_id) — deal stage templates.
//
// Per conventions §3.11 — sales pipelines vary by business model (consulting
// has Lead/Qualified/Proposal/Negotiation; subscription has Trial/Active).
// Ship templates as reference data; materialize per (org × business_line) at
// onboarding via applyDealStageTemplate.
// ============================================================================

export const dealStageTemplates = pgTable(
  'crm_deal_stage_templates',
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
    slugUnique: uniqueIndex('deal_stage_templates_slug_unique').on(t.slug),
  }),
)

export const dealStageTemplateLines = pgTable(
  'crm_deal_stage_template_lines',
  {
    id: id(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => dealStageTemplates.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull(),
    kind: dealStageKindEnum('kind').notNull(),
    defaultProbability: integer('default_probability').notNull().default(0),
    ...standardLifecycle,
  },
  (t) => ({
    templateSlugUnique: uniqueIndex('deal_stage_tpl_lines_unique').on(
      t.templateId,
      t.slug,
    ),
    templateOrderIdx: index('deal_stage_tpl_lines_order_idx').on(
      t.templateId,
      t.displayOrder,
    ),
  }),
)

// ============================================================================
// Deal stages (per-org, per-business-line). Materialized from a template at
// onboarding; tenants edit freely thereafter.
// ============================================================================

export const dealStages = pgTable(
  'crm_deal_stages',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    displayOrder: integer('display_order').notNull(),
    kind: dealStageKindEnum('kind').notNull(),
    defaultProbability: integer('default_probability').notNull().default(0),
    ...standardLifecycle,
  },
  (t) => ({
    blSlugUnique: uniqueIndex('deal_stages_bl_slug_unique').on(
      t.organizationId,
      t.businessLineId,
      t.slug,
    ),
    blOrderIdx: index('deal_stages_bl_order_idx').on(
      t.businessLineId,
      t.displayOrder,
    ),
  }),
)

// ============================================================================
// Rate cards (declared before contracts so contracts.rate_card_id resolves).
// ============================================================================

export const rateCards = pgTable(
  'crm_rate_cards',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: text('name').notNull(),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    currencyCode: currencyCode(),
    version: integer('version').notNull().default(1),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    blEffectiveIdx: index('rate_cards_bl_effective_idx').on(
      t.businessLineId,
      t.effectiveFrom,
    ),
  }),
)

export const rateCardLines = pgTable(
  'crm_rate_card_lines',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    rateCardId: uuid('rate_card_id')
      .notNull()
      .references(() => rateCards.id, { onDelete: 'cascade' }),
    roleName: text('role_name').notNull(),
    seniority: text('seniority'),
    hourlyRateCents: moneyCents('hourly_rate_cents'),
    dailyRateCents: moneyCentsNullable('daily_rate_cents'),
    notes: text('notes'),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => ({
    rateCardIdx: index('rate_card_lines_card_idx').on(t.rateCardId),
  }),
)

// ============================================================================
// Deals (depends on dealStages). Phase 1 creates the table; full pipeline UI
// Phase 2.
// ============================================================================

export const deals = pgTable(
  'crm_deals',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    dealNumber: text('deal_number').notNull(),
    name: text('name').notNull(),
    primaryPartyId: uuid('primary_party_id')
      .notNull()
      .references(() => parties.id),
    vendorPartyId: uuid('vendor_party_id').references(() => parties.id),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => dealStages.id),
    expectedValueCents: moneyCents('expected_value_cents').default(0),
    currencyCode: currencyCode(),
    probability: integer('probability').notNull(),
    expectedCloseDate: date('expected_close_date'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedWonAt: timestamp('closed_won_at', { withTimezone: true }),
    closedLostAt: timestamp('closed_lost_at', { withTimezone: true }),
    lostReason: text('lost_reason'),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    source: text('source'),
    description: text('description'),
    customFields: jsonb('custom_fields').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('deals_org_number_unique').on(
      t.organizationId,
      t.dealNumber,
    ),
    blStageIdx: index('deals_bl_stage_idx').on(
      t.businessLineId,
      t.stageId,
      t.deletedAt,
    ),
    primaryPartyIdx: index('deals_primary_party_idx').on(t.primaryPartyId),
    ownerStageIdx: index('deals_owner_stage_idx').on(t.ownerUserId, t.stageId),
  }),
)

// ============================================================================
// Contracts (depends on deals + rateCards + files).
// ============================================================================

export const contracts = pgTable(
  'crm_contracts',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    contractNumber: text('contract_number').notNull(),
    name: text('name').notNull(),
    dealId: uuid('deal_id').references(() => deals.id),
    endClientPartyId: uuid('end_client_party_id')
      .notNull()
      .references(() => parties.id),
    vendorPartyId: uuid('vendor_party_id').references(() => parties.id),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    rateCardId: uuid('rate_card_id').references(() => rateCards.id),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: contractStatusEnum('status').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    terminatedAt: timestamp('terminated_at', { withTimezone: true }),
    autoRenews: boolean('auto_renews').notNull().default(false),
    renewalNoticeDays: integer('renewal_notice_days'),
    signedPdfFileId: uuid('signed_pdf_file_id').references(() => files.id),
    totalValueCents: moneyCentsNullable('total_value_cents'),
    currencyCode: currencyCode(),
    terms: text('terms'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('contracts_org_number_unique').on(
      t.organizationId,
      t.contractNumber,
    ),
    endClientStatusIdx: index('contracts_end_client_status_idx').on(
      t.endClientPartyId,
      t.status,
    ),
    blEndIdx: index('contracts_bl_end_idx').on(t.businessLineId, t.endDate),
    statusEndIdx: index('contracts_status_end_idx').on(t.status, t.endDate),
  }),
)

// ============================================================================
// Type exports
// ============================================================================

export type DealStageTemplate = typeof dealStageTemplates.$inferSelect
export type DealStageTemplateLine = typeof dealStageTemplateLines.$inferSelect
export type DealStage = typeof dealStages.$inferSelect
export type NewDealStage = typeof dealStages.$inferInsert
export type Deal = typeof deals.$inferSelect
export type Contract = typeof contracts.$inferSelect
export type RateCard = typeof rateCards.$inferSelect
export type RateCardLine = typeof rateCardLines.$inferSelect
