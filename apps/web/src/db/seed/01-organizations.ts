import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { organizations } from '@/modules/parties/schema'

const VARAHI_GROUP_LEGAL_NAME = 'Varahi Group LLC'

/**
 * Returns the Varahi Group organization id. Idempotent — looks up by legal_name first.
 * Per conventions §3.10 we never hardcode the UUID; callers resolve at runtime.
 */
export async function seedOrganizations(): Promise<string> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.legalName, VARAHI_GROUP_LEGAL_NAME))
    .limit(1)

  if (existing) {
    return existing.id
  }

  const [inserted] = await db
    .insert(organizations)
    .values({
      legalName: VARAHI_GROUP_LEGAL_NAME,
      displayName: 'Varahi Group',
      homeState: 'NC',
      defaultCurrency: 'USD',
      defaultTimezone: 'America/New_York',
      defaultFilingStatus: 'married_jointly',
    })
    .returning({ id: organizations.id })

  if (!inserted) {
    throw new Error('Failed to insert Varahi Group organization')
  }
  return inserted.id
}
