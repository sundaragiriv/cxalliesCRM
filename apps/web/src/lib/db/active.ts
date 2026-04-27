import { isNull } from 'drizzle-orm'

/**
 * Soft-delete filter helper per conventions §3.6. Use in WHERE clauses on any
 * table that has `deleted_at`:
 *
 *   .where(and(eq(table.organizationId, orgId), active(table)))
 */
export function active(col: { deletedAt: unknown }) {
  return isNull(col.deletedAt as Parameters<typeof isNull>[0])
}
