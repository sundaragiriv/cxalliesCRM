import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { userRoles } from '@/modules/auth/schema'
import { checkPermission, type ModuleName, type ModuleAction } from './permissions'

/**
 * Inner shared check used by both procedureWithAuth (tRPC) and withPermission
 * (Server Actions). Loads the user's role assignments and tests the matrix.
 */
export async function requirePermission(
  userId: string,
  module: ModuleName,
  action: ModuleAction,
): Promise<boolean> {
  const rows = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))

  const roleIds = rows.map((r) => r.roleId)
  return checkPermission(roleIds, module, action)
}
