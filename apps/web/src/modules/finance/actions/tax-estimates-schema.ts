import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

/**
 * Mark a quarterly tax estimate as paid. The user can split the payment
 * across federal/state/SE explicitly; the action validates that the parts
 * sum to the total and posts the journal accordingly. Defaults split per
 * the estimate's computed proportions (UI fills these in).
 */
export const markTaxEstimatePaidSchema = z
  .object({
    id: z.string().uuid(),
    paidOn: isoDate,
    federalCents: z.number().int().min(0),
    stateCents: z.number().int().min(0),
    seCents: z.number().int().min(0),
    reference: z.string().trim().min(1, 'Reference required').max(200),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.federalCents + v.stateCents + v.seCents > 0, {
    message: 'Total paid must be greater than 0',
    path: ['federalCents'],
  })
export type MarkTaxEstimatePaidInput = z.infer<typeof markTaxEstimatePaidSchema>

export const recomputeTaxEstimatesSchema = z.object({
  year: z.number().int().min(2000).max(2100),
})
export type RecomputeTaxEstimatesInput = z.infer<typeof recomputeTaxEstimatesSchema>
