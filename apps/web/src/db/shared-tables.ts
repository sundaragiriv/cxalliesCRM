import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  inet,
  date,
  numeric,
  index,
  uniqueIndex,
  char,
} from 'drizzle-orm/pg-core'
import { id, organizationId, timestamps } from '@/db/shared'
import { auditActionEnum } from '@/db/enums'
import { organizations, parties, businessLines } from '@/modules/parties/schema'
import { users } from '@/modules/auth/schema'

/**
 * Unified activity timeline. Per ADR-0001 — exempt from module ownership.
 * The Customer 360 view is `SELECT * FROM activities WHERE party_id = ? ORDER BY occurred_at DESC`.
 */
export const activities = pgTable(
  'activities',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    partyId: uuid('party_id').references(() => parties.id),
    kind: text('kind').notNull(),
    entityTable: text('entity_table'),
    entityId: uuid('entity_id'),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    summary: text('summary').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    partyOccurredIdx: index('act_party_occurred_idx').on(t.partyId, t.occurredAt),
    entityOccurredIdx: index('act_entity_occurred_idx').on(
      t.entityTable,
      t.entityId,
      t.occurredAt,
    ),
    blOccurredIdx: index('act_bl_occurred_idx').on(t.businessLineId, t.occurredAt),
    orgOccurredIdx: index('act_org_occurred_idx').on(t.organizationId, t.occurredAt),
  }),
)

/**
 * Append-only audit log. Every mutation writes here.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    action: auditActionEnum('action').notNull(),
    tableName: text('table_name').notNull(),
    recordId: uuid('record_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    requestId: uuid('request_id'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => ({
    tableRecordIdx: index('audit_table_record_idx').on(
      t.tableName,
      t.recordId,
      t.occurredAt,
    ),
    actorIdx: index('audit_actor_idx').on(t.actorUserId, t.occurredAt),
    orgIdx: index('audit_org_idx').on(t.organizationId, t.occurredAt),
  }),
)

/**
 * Exchange rates. Phase 1 stores USD-only operations; columns reserved for future.
 */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    fromCurrency: char('from_currency', { length: 3 }).notNull(),
    toCurrency: char('to_currency', { length: 3 }).notNull(),
    rateDate: date('rate_date').notNull(),
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    source: text('source').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    pairDateUnique: uniqueIndex('xr_pair_date_unique').on(
      t.organizationId,
      t.fromCurrency,
      t.toCurrency,
      t.rateDate,
    ),
  }),
)

export type Activity = typeof activities.$inferSelect
export type NewActivity = typeof activities.$inferInsert
export type AuditLogEntry = typeof auditLog.$inferSelect
export type ExchangeRate = typeof exchangeRates.$inferSelect
