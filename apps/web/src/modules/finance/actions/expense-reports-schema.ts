import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

/**
 * Create a new expense report (always starts in 'draft').
 * Optional `expenseIds` pre-attaches expenses on the way in (the
 * "create from selected expenses" UX). Validation that those expenses are
 * eligible (is_reimbursable=true, expense_report_id IS NULL, same currency)
 * happens in the action handler with full DB context.
 */
export const createExpenseReportSchema = z.object({
  purpose: z.string().trim().min(1, 'Required').max(500),
  periodStart: isoDate,
  periodEnd: isoDate,
  businessLineId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  /** Pre-select expenses to attach on create. Empty array allowed. */
  expenseIds: z.array(z.string().uuid()).optional(),
})
export type CreateExpenseReportInput = z.infer<typeof createExpenseReportSchema>

/**
 * Edit a draft report's content. Allowed only when status='draft' (enforced
 * by the action handler).
 */
export const updateExpenseReportSchema = z.object({
  id: z.string().uuid(),
  purpose: z.string().trim().min(1, 'Required').max(500),
  periodStart: isoDate,
  periodEnd: isoDate,
  businessLineId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
})
export type UpdateExpenseReportInput = z.infer<typeof updateExpenseReportSchema>

export const addExpensesToReportSchema = z.object({
  reportId: z.string().uuid(),
  expenseIds: z.array(z.string().uuid()).min(1, 'Select at least one expense'),
})
export type AddExpensesToReportInput = z.infer<typeof addExpensesToReportSchema>

export const removeExpensesFromReportSchema = z.object({
  reportId: z.string().uuid(),
  expenseIds: z.array(z.string().uuid()).min(1, 'Select at least one expense'),
})
export type RemoveExpensesFromReportInput = z.infer<typeof removeExpensesFromReportSchema>

export const submitExpenseReportSchema = z.object({
  id: z.string().uuid(),
})
export type SubmitExpenseReportInput = z.infer<typeof submitExpenseReportSchema>

export const approveExpenseReportSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().trim().max(1000).optional(),
})
export type ApproveExpenseReportInput = z.infer<typeof approveExpenseReportSchema>

export const rejectExpenseReportSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1, 'Reason is required').max(1000),
})
export type RejectExpenseReportInput = z.infer<typeof rejectExpenseReportSchema>

export const reopenExpenseReportSchema = z.object({
  id: z.string().uuid(),
})
export type ReopenExpenseReportInput = z.infer<typeof reopenExpenseReportSchema>

export const markReimbursedSchema = z.object({
  id: z.string().uuid(),
  /** ISO date the reimbursement settled; defaults to today UTC if omitted. */
  reimbursedOn: isoDate.optional(),
  notes: z.string().trim().max(1000).optional(),
})
export type MarkReimbursedInput = z.infer<typeof markReimbursedSchema>

export const softDeleteExpenseReportSchema = z.object({
  id: z.string().uuid(),
})
export type SoftDeleteExpenseReportInput = z.infer<typeof softDeleteExpenseReportSchema>
