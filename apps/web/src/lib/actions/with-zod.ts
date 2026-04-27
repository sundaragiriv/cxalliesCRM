import type { z } from 'zod'
import { ValidationError } from './validation-error'

/**
 * Parses raw input through a zod schema. On failure, throws ValidationError
 * with `{ fieldErrors }` keyed by dot-path. withPermission catches and
 * converts to ActionResult.
 */
export function withZod<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  fn: (input: TInput) => Promise<TOutput>,
): (raw: unknown) => Promise<TOutput> {
  return async (raw: unknown) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.')
        if (path && !fieldErrors[path]) fieldErrors[path] = issue.message
      }
      throw new ValidationError(fieldErrors)
    }
    return fn(parsed.data)
  }
}
