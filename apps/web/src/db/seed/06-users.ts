import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { users, userRoles } from '@/modules/auth/schema'
import { auth } from '@/lib/auth'
import { env } from '@/lib/env'

/**
 * Seeds Venkata as the Owner user.
 * - Creates the user via Better Auth (handles password hashing + auth_accounts row).
 * - Sets users.party_id to link to Venkata's Party row.
 * - Grants the 'owner' role.
 *
 * Idempotent: if the user already exists with the seed email, the function exits early.
 */
export async function seedOwnerUser(venkataPartyId: string): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, env.OWNER_EMAIL))
    .limit(1)

  if (existing) {
    return existing.id
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: env.OWNER_EMAIL,
      password: env.OWNER_PASSWORD,
      name: 'Venkata Sundaragiri',
    },
    asResponse: false,
  })

  const ownerUser = (result as { user?: { id: string } } | null)?.user
  if (!ownerUser) {
    throw new Error('Better Auth signUpEmail did not return a user.')
  }

  await db.update(users).set({ partyId: venkataPartyId }).where(eq(users.id, ownerUser.id))

  await db
    .insert(userRoles)
    .values({ userId: ownerUser.id, roleId: 'owner' })
    .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] })

  return ownerUser.id
}
