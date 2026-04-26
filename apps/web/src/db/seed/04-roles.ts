import { db } from '@/db/client'
import { roles } from '@/modules/auth/schema'

const ROLE_SEEDS = [
  {
    id: 'owner',
    displayName: 'Owner',
    description:
      'Full system access. Owns billing, users, and all destructive operations. Cannot be deleted.',
  },
  {
    id: 'admin',
    displayName: 'Admin',
    description: 'Full access except billing, user management, and destructive operations.',
  },
  {
    id: 'bookkeeper',
    displayName: 'Bookkeeper',
    description:
      'Read/write access to Finance and Billing. Read-only access to CRM and Support. No Settings access.',
  },
  {
    id: 'sales',
    displayName: 'Sales',
    description: 'Read/write access to CRM and Marketing. Read-only access to Finance for own deals.',
  },
  {
    id: 'support_agent',
    displayName: 'Support Agent',
    description:
      'Read/write access to Support and Knowledge Base. Read-only access to CRM. No Finance access.',
  },
] as const

export async function seedRoles(): Promise<void> {
  await db
    .insert(roles)
    .values(ROLE_SEEDS.map((r) => ({ ...r, isSystem: true })))
    .onConflictDoNothing({ target: roles.id })
}
