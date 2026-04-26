import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { requirePermission } from './require-permission'
import type { ModuleName, ModuleAction } from './permissions'

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }

/**
 * Server Action higher-order function that asserts (module, action) permission
 * before executing `fn`. Per conventions §4.5, every action returns ActionResult<T>.
 *
 *   export const createExpense = withPermission(
 *     'finance',
 *     'write',
 *     async (input: CreateExpenseInput) => { ... return expense; }
 *   );
 */
export function withPermission<TInput, TOutput>(
  module: ModuleName,
  action: ModuleAction,
  fn: (input: TInput) => Promise<TOutput>,
): (input: TInput) => Promise<ActionResult<TOutput>> {
  return async (input: TInput): Promise<ActionResult<TOutput>> => {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not signed in' },
      }
    }

    const allowed = await requirePermission(session.user.id, module, action)
    if (!allowed) {
      return {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Missing permission: ${module}.${action}`,
        },
      }
    }

    try {
      const data = await fn(input)
      return { success: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: { code: 'INTERNAL', message } }
    }
  }
}
