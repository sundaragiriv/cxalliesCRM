import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { twoFactor } from 'better-auth/plugins'
import { db } from '@/db/client'
import {
  users,
  authSessions,
  authAccounts,
  authVerifications,
  authTwoFactor,
} from '@/modules/auth/schema'
import { organizations } from '@/modules/parties/schema'
import { env } from '@/lib/env'

export const auth = betterAuth({
  appName: 'CXAllies',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  // Our schemas use uuid PKs (per data-model §1). Override Better Auth's default
  // short-id generator to produce UUIDs that match the column type.
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },

  database: drizzleAdapter(db, {
    provider: 'pg',
    // Schema map keys match Better Auth's modelName overrides below
    // (Drizzle adapter looks up tables by modelName when set).
    schema: {
      users,
      authSessions,
      authAccounts,
      authVerifications,
      authTwoFactor,
    },
  }),

  user: {
    modelName: 'users',
    fields: {
      name: 'displayName',
    },
    additionalFields: {
      organizationId: { type: 'string', required: false, input: false },
      partyId: { type: 'string', required: false, input: false },
      timezone: { type: 'string', defaultValue: 'America/New_York', input: false },
      locale: { type: 'string', defaultValue: 'en-US', input: false },
      lastLoginAt: { type: 'date', required: false, input: false },
      avatarFileId: { type: 'string', required: false, input: false },
    },
  },

  account: {
    modelName: 'authAccounts',
    fields: {
      password: 'passwordHash',
    },
  },

  session: { modelName: 'authSessions' },
  verification: { modelName: 'authVerifications' },

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 12,
  },

  // Single-tenant Phase 1: every new user is attached to the Varahi Group org.
  // Multi-tenant Phase 2 will replace this with per-invite org context.
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const [org] = await db
            .select({ id: organizations.id })
            .from(organizations)
            .limit(1)
          if (!org) {
            throw new Error('No organization seeded; run pnpm db:seed first.')
          }
          return { data: { ...user, organizationId: org.id } }
        },
      },
    },
  },

  plugins: [
    twoFactor({ issuer: 'CXAllies' }),
  ],
})

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>
