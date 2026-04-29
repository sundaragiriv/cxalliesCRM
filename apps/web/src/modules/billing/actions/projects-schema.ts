import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(200),
  businessLineId: z.string().uuid('Pick a business line'),
  contractId: z.string().uuid().nullable().optional(),
  endClientPartyId: z.string().uuid().nullable().optional(),
  vendorPartyId: z.string().uuid().nullable().optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  status: z
    .enum(['planned', 'active', 'on_hold', 'completed', 'canceled'])
    .default('planned'),
  defaultBillableRateCents: z
    .number()
    .int()
    .nonnegative('Rate must be ≥ 0'),
  currencyCode: z.string().length(3).default('USD'),
  budgetHours: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
})
export type CreateProjectInput = z.infer<typeof createProjectSchema>

export const updateProjectSchema = createProjectSchema.extend({
  id: z.string().uuid(),
})
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

export const softDeleteProjectSchema = z.object({ id: z.string().uuid() })
export type SoftDeleteProjectInput = z.infer<typeof softDeleteProjectSchema>
