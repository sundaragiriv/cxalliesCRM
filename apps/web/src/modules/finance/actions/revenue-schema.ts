import { z } from 'zod'

const paymentMethodValues = [
  'check',
  'ach',
  'wire',
  'card',
  'cash',
  'other',
] as const

const paymentStatusValues = [
  'expected',
  'received',
  'failed',
  'refunded',
] as const

export type PaymentMethod = (typeof paymentMethodValues)[number]
export type PaymentStatus = (typeof paymentStatusValues)[number]

const baseRevenueSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  businessLineId: z.string().uuid('Pick a business line'),
  partyId: z.string().uuid().nullable().optional(),
  chartOfAccountsId: z.string().uuid('Pick a revenue account'),
  description: z.string().trim().min(1, 'Required').max(500),
  amountCents: z.number().int().positive('Must be > 0'),
  currencyCode: z.string().length(3).default('USD'),
  paymentMethod: z.enum(paymentMethodValues).nullable().optional(),
  paymentStatus: z.enum(paymentStatusValues).default('received'),
  receivedAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const createRevenueSchema = baseRevenueSchema
export type CreateRevenueInput = z.infer<typeof createRevenueSchema>

export const updateRevenueSchema = baseRevenueSchema.extend({
  id: z.string().uuid(),
})
export type UpdateRevenueInput = z.infer<typeof updateRevenueSchema>

export const softDeleteRevenueSchema = z.object({ id: z.string().uuid() })
export type SoftDeleteRevenueInput = z.infer<typeof softDeleteRevenueSchema>

/**
 * Material change → reverse + repost. Cosmetic change → simple UPDATE.
 * Used by updateRevenue to decide whether to touch the journal.
 */
export const MATERIAL_FIELDS = [
  'amountCents',
  'chartOfAccountsId',
  'businessLineId',
  'paymentStatus',
  'currencyCode',
] as const satisfies ReadonlyArray<keyof CreateRevenueInput>

export type MaterialField = (typeof MATERIAL_FIELDS)[number]
