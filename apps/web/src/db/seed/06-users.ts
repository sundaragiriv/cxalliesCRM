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

  let ownerUserId: string
  if (existing) {
    ownerUserId = existing.id
  } else {
    // Pass localhost headers so Better Auth's session-create has a valid
    // ip_address for the inet column (empty string → Postgres `network_in` error).
    const result = await auth.api.signUpEmail({
      body: {
        email: env.OWNER_EMAIL,
        password: env.OWNER_PASSWORD,
        name: 'Venkata Sundaragiri',
      },
      headers: new Headers({
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'CXAllies/seed',
      }),
      asResponse: false,
    })

    const ownerUser = (result as { user?: { id: string } } | null)?.user
    if (!ownerUser) {
      throw new Error('Better Auth signUpEmail did not return a user.')
    }
    ownerUserId = ownerUser.id
  }

  // Run these on every seed call so a partially-created user is always
  // brought to a fully-configured state (idempotent, like the prior seeds).
  await db.update(users).set({ partyId: venkataPartyId }).where(eq(users.id, ownerUserId))

  await db
    .insert(userRoles)
    .values({ userId: ownerUserId, roleId: 'owner' })
    .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] })

  return ownerUserId
}
