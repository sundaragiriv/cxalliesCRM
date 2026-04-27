import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  char,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { id, organizationId, standardLifecycle } from '@/db/shared'
import {
  partyKindEnum,
  partyRoleEnum,
  partyRelationshipKindEnum,
  businessLineKindEnum,
  addressKindEnum,
  customFieldTypeEnum,
  filingStatusEnum,
} from '@/db/enums'
import { users } from '@/modules/auth/schema'

/**
 * Singleton today: the Varahi Group LLC row. Future SaaS pivot adds more rows.
 *
 * No organization_id self-FK — this *is* the organization.
 * The logo_file_id FK is declared in a follow-up SQL migration to avoid an
 * import cycle with the files module.
 */
export const organizations = pgTable('organizations', {
  id: id(),
  legalName: text('legal_name').notNull(),
  displayName: text('display_name').notNull(),
  ein: text('ein'),
  stateTaxId: text('state_tax_id'),
  homeState: char('home_state', { length: 2 }).notNull().default('NC'),
  defaultCurrency: char('default_currency', { length: 3 }).notNull().default('USD'),
  defaultTimezone: text('default_timezone').notNull().default('America/New_York'),
  defaultFilingStatus: filingStatusEnum('default_filing_status'),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  logoFileId: uuid('logo_file_id'),
  ...standardLifecycle,
})

/**
 * A customer-facing identity (CXAllies, Pravara.ai). Roll-up parent for Business Lines.
 *
 * `slug` is the stable lookup key for seeds and code references per conventions §3.2.
 * The logo_file_id FK is declared in a follow-up SQL migration.
 */
export const brands = pgTable(
  'brands',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    domain: text('domain'),
    logoFileId: uuid('logo_file_id'),
    description: text('description'),
    ...standardLifecycle,
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('brands_org_slug_unique').on(t.organizationId, t.slug),
    orgNameIdx: index('brands_org_name_idx').on(t.organizationId, t.name),
  }),
)

/**
 * Configurable revenue stream / cost center. Replaces hardcoded enum.
 * Every transactional entity carries a business_line_id.
 */
export const businessLines = pgTable(
  'business_lines',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    kind: businessLineKindEnum('kind').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    ...standardLifecycle,
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('business_lines_org_slug_unique').on(
      t.organizationId,
      t.slug,
    ),
    brandIdx: index('business_lines_brand_idx').on(t.brandId),
  }),
)

/**
 * The universal contact record. Person or organization. Spine of the system.
 *
 * The employer_party_id self-FK is declared in a follow-up SQL migration.
 * The full-text search column (search_tsv) is added in a separate FTS migration.
 */
export const parties = pgTable(
  'parties',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    kind: partyKindEnum('kind').notNull(),
    displayName: text('display_name').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    title: text('title'),
    legalName: text('legal_name'),
    dba: text('dba'),
    ein: text('ein'),
    industry: text('industry'),
    employerPartyId: uuid('employer_party_id'),
    primaryEmail: text('primary_email'),
    primaryPhone: text('primary_phone'),
    website: text('website'),
    notes: text('notes'),
    customFields: jsonb('custom_fields').notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgKindActiveIdx: index('parties_org_kind_active_idx').on(
      t.organizationId,
      t.kind,
      t.deletedAt,
    ),
    emailIdx: index('parties_email_idx').on(t.primaryEmail),
    customFieldsGin: index('parties_custom_fields_gin').using('gin', t.customFields),
  }),
)

/**
 * A Party can hold many roles simultaneously. Junction table.
 */
export const partyRoles = pgTable(
  'party_roles',
  {
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    role: partyRoleEnum('role').notNull(),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.partyId, t.role, t.businessLineId] }),
    activeIdx: index('party_roles_active_idx').on(t.partyId, t.isActive),
  }),
)

/**
 * N:N relationships between parties (works_at, manages, etc.).
 */
export const partyRelationships = pgTable(
  'party_relationships',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    fromPartyId: uuid('from_party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    toPartyId: uuid('to_party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    kind: partyRelationshipKindEnum('kind').notNull(),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    fromIdx: index('party_relationships_from_idx').on(t.fromPartyId),
    toIdx: index('party_relationships_to_idx').on(t.toPartyId),
  }),
)

/**
 * Polymorphic addresses table. Referenced by parties, organizations, future shipping.
 * Polymorphism is not enforced at the DB level (entity_table is text).
 */
export const addresses = pgTable(
  'addresses',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entityTable: text('entity_table').notNull(),
    entityId: uuid('entity_id').notNull(),
    kind: addressKindEnum('kind').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    line1: text('line_1'),
    line2: text('line_2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country'),
    formatted: text('formatted').notNull(),
    ...standardLifecycle,
  },
  (t) => ({
    entityIdx: index('addresses_entity_idx').on(t.entityTable, t.entityId, t.isPrimary),
  }),
)

/**
 * Tags. Polymorphic via entity_tags junction.
 */
export const tags = pgTable(
  'tags',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    color: text('color'),
    ...standardLifecycle,
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('tags_org_slug_unique').on(t.organizationId, t.slug),
  }),
)

export const entityTags = pgTable(
  'entity_tags',
  {
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    entityTable: text('entity_table').notNull(),
    entityId: uuid('entity_id').notNull(),
    taggedAt: timestamp('tagged_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    taggedByUserId: uuid('tagged_by_user_id').references(() => users.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tagId, t.entityTable, t.entityId] }),
    entityIdx: index('entity_tags_entity_idx').on(t.entityTable, t.entityId),
  }),
)

/**
 * Custom field definitions. Drives the custom_fields JSONB on parties, deals, tickets.
 */
export const customFieldDefinitions = pgTable(
  'custom_field_definitions',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entityTable: text('entity_table').notNull(),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    fieldKey: text('field_key').notNull(),
    fieldLabel: text('field_label').notNull(),
    fieldType: customFieldTypeEnum('field_type').notNull(),
    options: jsonb('options'),
    isRequired: boolean('is_required').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    ...standardLifecycle,
  },
  (t) => ({
    keyUnique: uniqueIndex('custom_field_def_key_unique').on(
      t.organizationId,
      t.entityTable,
      t.businessLineId,
      t.fieldKey,
    ),
  }),
)

export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert
export type Brand = typeof brands.$inferSelect
export type NewBrand = typeof brands.$inferInsert
export type BusinessLine = typeof businessLines.$inferSelect
export type NewBusinessLine = typeof businessLines.$inferInsert
export type Party = typeof parties.$inferSelect
export type NewParty = typeof parties.$inferInsert
export type PartyRole = typeof partyRoles.$inferSelect
export type Tag = typeof tags.$inferSelect
