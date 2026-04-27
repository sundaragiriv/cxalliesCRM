'use client'

import { useState } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export interface UseFormWithActionOptions<TForm extends FieldValues, TResult> {
  form: UseFormReturn<TForm>
  action: (input: TForm) => Promise<ActionResult<TResult>>
  /** Optional message shown via toast on success. */
  successMessage?: string
  /** Optional callback fired on success with the action's data. */
  onSuccess?: (data: TResult) => void | Promise<void>
}

/**
 * Wraps the standard Server Action submission pattern from conventions §5.2:
 * call the action, route field errors back to react-hook-form, toast on
 * success/failure, and run onSuccess if the call succeeded.
 */
export function useFormWithAction<TForm extends FieldValues, TResult>(
  opts: UseFormWithActionOptions<TForm, TResult>,
) {
  const [submitting, setSubmitting] = useState(false)

  async function submit(values: TForm) {
    setSubmitting(true)
    try {
      const result = await opts.action(values)
      if (!result.success) {
        if (result.fieldErrors) {
          for (const [field, msg] of Object.entries(result.fieldErrors)) {
            opts.form.setError(field as never, { message: msg })
          }
        }
        toast.error(result.error)
        return
      }
      if (opts.successMessage) toast.success(opts.successMessage)
      await opts.onSuccess?.(result.data)
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting }
}
