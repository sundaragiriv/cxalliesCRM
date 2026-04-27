/**
 * Thrown by `withZod` (and any action handler) when input validation fails.
 * Caught by `withPermission` which converts to ActionResult.fieldErrors so
 * react-hook-form can surface the messages inline.
 */
export class ValidationError extends Error {
  constructor(public readonly fieldErrors: Record<string, string>) {
    super('Validation failed')
    this.name = 'ValidationError'
  }
}
