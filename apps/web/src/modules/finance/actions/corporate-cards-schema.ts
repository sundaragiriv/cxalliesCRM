import { z } from 'zod'

const cardTypeValues = ['visa', 'mastercard', 'amex', 'discover', 'other'] as const
const cardOwnershipValues = ['business_owned', 'personal_with_business_use'] as const

const baseCorporateCardSchema = z.object({
  nickname: z.string().trim().min(1, 'Required').max(100),
  lastFour: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
  cardType: z.enum(cardTypeValues),
  ownership: z.enum(cardOwnershipValues),
  holderUserId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const createCorporateCardSchema = baseCorporateCardSchema
export type CreateCorporateCardInput = z.infer<typeof createCorporateCardSchema>

export const updateCorporateCardSchema = baseCorporateCardSchema.extend({
  id: z.string().uuid(),
})
export type UpdateCorporateCardInput = z.infer<typeof updateCorporateCardSchema>

export const softDeleteCorporateCardSchema = z.object({ id: z.string().uuid() })
export type SoftDeleteCorporateCardInput = z.infer<typeof softDeleteCorporateCardSchema>

export type CardType = (typeof cardTypeValues)[number]
export type CardOwnership = (typeof cardOwnershipValues)[number]
