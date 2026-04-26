import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { parties } from '@/modules/parties/schema'
import { env } from '@/lib/env'

type PersonSeed = {
  firstName: string
  lastName: string
  displayName: string
  primaryEmail: string | null
}

async function upsertPerson(organizationId: string, seed: PersonSeed): Promise<string> {
  const [existing] = await db
    .select({ id: parties.id })
    .from(parties)
    .where(
      and(
        eq(parties.organizationId, organizationId),
        eq(parties.firstName, seed.firstName),
        eq(parties.lastName, seed.lastName),
      ),
    )
    .limit(1)

  if (existing) return existing.id

  const [inserted] = await db
    .insert(parties)
    .values({
      organizationId,
      kind: 'person',
      firstName: seed.firstName,
      lastName: seed.lastName,
      displayName: seed.displayName,
      primaryEmail: seed.primaryEmail,
    })
    .returning({ id: parties.id })

  if (!inserted) {
    throw new Error(`Failed to insert party for ${seed.firstName} ${seed.lastName}`)
  }
  return inserted.id
}

/**
 * Seeds Venkata + Poornima as Person-Parties.
 * Returns Venkata's party id so 06-users can link the Owner user to it.
 * Idempotent on (organization_id, first_name, last_name).
 */
export async function seedParties(organizationId: string): Promise<{
  venkataPartyId: string
  poornimaPartyId: string
}> {
  const venkataPartyId = await upsertPerson(organizationId, {
    firstName: 'Venkata',
    lastName: 'Sundaragiri',
    displayName: 'Venkata Sundaragiri',
    primaryEmail: env.OWNER_EMAIL,
  })

  const poornimaPartyId = await upsertPerson(organizationId, {
    firstName: 'Poornima',
    lastName: 'Sundaragiri',
    displayName: 'Poornima Sundaragiri',
    primaryEmail: null,
  })

  return { venkataPartyId, poornimaPartyId }
}
