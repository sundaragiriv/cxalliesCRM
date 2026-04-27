import { z } from 'zod'

const paymentSourceValues = [
  'business_card',
  'personal_card_business_use',
  'personal_cash',
  'business_check',
  'business_ach',
  'vendor_paid',
] as const

const baseExpenseSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  businessLineId: z.string().uuid('Pick a business line'),
  chartOfAccountsId: z.string().uuid('Pick an expense account'),
  payeePartyId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1, 'Required').max(500),
  amountCents: z.number().int().positive('Must be > 0'),
  currencyCode: z.string().length(3).default('USD'),
  paymentSource: z.enum(paymentSourceValues),
  corporateCardId: z.string().uuid().nullable().optional(),
  isBillable: z.boolean().default(false),
  isReimbursable: z.boolean().default(false),
  projectId: z.string().uuid().nullable().optional(),
  receiptFileId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const createExpenseSchema = baseExpenseSchema
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>

export const updateExpenseSchema = baseExpenseSchema.extend({
  id: z.string().uuid(),
})
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>

export const softDeleteExpenseSchema = z.object({ id: z.string().uuid() })
export type SoftDeleteExpenseInput = z.infer<typeof softDeleteExpenseSchema>

export type PaymentSource = (typeof paymentSourceValues)[number]
