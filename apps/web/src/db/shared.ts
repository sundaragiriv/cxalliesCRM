import { sql } from 'drizzle-orm'
import { uuid, timestamp, char, bigint } from 'drizzle-orm/pg-core'

/**
 * Standard ID column. UUID primary key, defaulted at the database level.
 */
export const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`)

/**
 * Multi-tenant scope column. Required on every primary entity.
 * Singleton today (Varahi Group); future SaaS pivot is purely additive.
 */
export const organizationId = () => uuid('organization_id').notNull()

/**
 * Standard timestamps. created_at + updated_at, both defaulted in DB.
 * The updated_at trigger lives in a separate migration; not enforced at ORM level.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}

/**
 * Soft-delete column. NULL = active.
 */
export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}

/**
 * Standard set: timestamps + soft delete. Use for most tables.
 */
export const standardLifecycle = {
  ...timestamps,
  ...softDelete,
}

/**
 * Currency code (ISO 4217). Default USD.
 */
export const currencyCode = () =>
  char('currency_code', { length: 3 }).notNull().default('USD')

/**
 * Money column helper. Stores integer cents.
 * Always paired with currencyCode().
 */
export const moneyCents = (name: string) =>
  bigint(name, { mode: 'number' }).notNull()

export const moneyCentsNullable = (name: string) =>
  bigint(name, { mode: 'number' })
