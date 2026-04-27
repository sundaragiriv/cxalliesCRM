import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { requirePermission } from './require-permission'
import { ValidationError } from '@/lib/actions/validation-error'
import type { ModuleName, ModuleAction } from './permissions'

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

/**
 * Server Action higher-order function. Per conventions §4.5, every Server
 * Action returns ActionResult<T>. Composes with `withAudit` (per §4.8) and
 * `withZod` (per §4.4) — see lib/actions/define-action.ts for the unified
 * helper most actions should use.
 */
export function withPermission<TInput, TOutput>(
  module: ModuleName,
  action: ModuleAction,
  fn: (input: TInput) => Promise<TOutput>,
): (input: TInput) => Promise<ActionResult<TOutput>> {
  return async (input: TInput): Promise<ActionResult<TOutput>> => {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return { success: false, error: 'Not signed in' }
    }

    const allowed = await requirePermission(session.user.id, module, action)
    if (!allowed) {
      return { success: false, error: `Missing permission: ${module}.${action}` }
    }

    try {
      const data = await fn(input)
      return { success: true, data }
    } catch (err) {
      if (err instanceof ValidationError) {
        return { success: false, error: 'Validation failed', fieldErrors: err.fieldErrors }
      }
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: message }
    }
  }
}
