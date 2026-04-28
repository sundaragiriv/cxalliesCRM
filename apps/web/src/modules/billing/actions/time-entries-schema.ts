import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

/**
 * Hours: numeric(5,2) at the schema layer. Form sends a decimal string;
 * we coerce via z.coerce.number() and round-trip to 2 decimals at write.
 * Bounds: 0 < hours <= 24 per cell (one calendar day cap; multi-day
 * entries split via separate cells).
 */
const hoursSchema = z.coerce
  .number()
  .positive('Hours must be > 0')
  .max(24, 'Hours per day cannot exceed 24')

/**
 * Grid-cell upsert: inserts on conflict (org, project, user, entry_date)
 * does update SET hours, description, billable_rate_cents, updated_at.
 *
 * The action handler resolves the auth user → submittedByUserId.
 */
export const upsertTimeEntrySchema = z.object({
  projectId: z.string().uuid('Pick a project'),
  entryDate: isoDate,
  hours: hoursSchema,
  description: z.string().trim().min(1, 'Required').max(500),
  /**
   * Per-entry rate override. If null, snapshot from
   * project.default_billable_rate_cents at handler time. If both are null,
   * the action throws — Q4 footgun guard.
   */
  billableRateCents: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})
export type UpsertTimeEntryInput = z.infer<typeof upsertTimeEntrySchema>

/**
 * Edit a specific entry by id (used by the detail dialog when the user
 * needs to override description/rate/notes outside the grid).
 */
export const updateTimeEntrySchema = z.object({
  id: z.string().uuid(),
  hours: hoursSchema,
  description: z.string().trim().min(1, 'Required').max(500),
  billableRateCents: z.number().int().nonnegative(),
  notes: z.string().trim().max(2000).nullable().optional(),
})
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>

export const softDeleteTimeEntrySchema = z.object({
  id: z.string().uuid(),
})
export type SoftDeleteTimeEntryInput = z.infer<typeof softDeleteTimeEntrySchema>
