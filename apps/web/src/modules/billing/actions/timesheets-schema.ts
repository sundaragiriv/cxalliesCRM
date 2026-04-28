import { z } from 'zod'

export const submitTimesheetSchema = z.object({
  id: z.string().uuid(),
})
export type SubmitTimesheetInput = z.infer<typeof submitTimesheetSchema>

export const approveTimesheetSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().trim().max(1000).optional(),
})
export type ApproveTimesheetInput = z.infer<typeof approveTimesheetSchema>

export const rejectTimesheetSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1, 'Reason is required').max(1000),
})
export type RejectTimesheetInput = z.infer<typeof rejectTimesheetSchema>

export const reopenTimesheetSchema = z.object({
  id: z.string().uuid(),
})
export type ReopenTimesheetInput = z.infer<typeof reopenTimesheetSchema>

export const softDeleteTimesheetSchema = z.object({
  id: z.string().uuid(),
})
export type SoftDeleteTimesheetInput = z.infer<typeof softDeleteTimesheetSchema>
