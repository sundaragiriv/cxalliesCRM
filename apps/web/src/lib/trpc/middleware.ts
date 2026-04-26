import { TRPCError } from '@trpc/server'
import { authedProcedure } from './server'
import { requirePermission } from '@/lib/auth/require-permission'
import type { ModuleName, ModuleAction } from '@/lib/auth/permissions'

/**
 * tRPC procedure factory that requires a specific (module, action) permission.
 * The calling user's roles are checked against the permissions matrix.
 *
 * Usage:
 *   export const list = procedureWithAuth({ module: 'finance', action: 'read' })
 *     .input(z.object({ ... }))
 *     .query(async ({ ctx, input }) => { ... });
 */
export function procedureWithAuth(args: { module: ModuleName; action: ModuleAction }) {
  return authedProcedure.use(async ({ ctx, next }) => {
    const allowed = await requirePermission(ctx.user.id, args.module, args.action)
    if (!allowed) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Missing permission: ${args.module}.${args.action}`,
      })
    }
    return next({ ctx })
  })
}
