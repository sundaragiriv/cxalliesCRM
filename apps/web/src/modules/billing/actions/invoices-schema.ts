import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

/**
 * Generate invoice from a project + period. Pulls approved time entries
 * and active billable expenses for that project + window into a draft
 * invoice. Multi-currency entries throw.
 */
export const generateInvoiceFromProjectSchema = z.object({
  projectId: z.string().uuid('Pick a project'),
  periodStart: isoDate,
  periodEnd: isoDate,
  /** Bill-to overrides project.end_client_party_id when set. */
  billToPartyId: z.string().uuid().nullable().optional(),
  issueDate: isoDate,
  dueDate: isoDate,
  terms: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
})
export type GenerateInvoiceFromProjectInput = z.infer<
  typeof generateInvoiceFromProjectSchema
>

const manualLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantityText: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid quantity'),
  unitPriceCents: z.number().int().nonnegative(),
  /**
   * Required for manual lines: no project to resolve revenue account from.
   */
  chartOfAccountsId: z.string().uuid('Pick a revenue account'),
  kind: z.enum(['fixed', 'discount']).default('fixed'),
})
export type ManualLineInput = z.infer<typeof manualLineSchema>

export const createInvoiceSchema = z.object({
  billToPartyId: z.string().uuid('Pick a customer'),
  businessLineId: z.string().uuid('Pick a business line'),
  projectId: z.string().uuid().nullable().optional(),
  issueDate: isoDate,
  dueDate: isoDate,
  currencyCode: z.string().length(3).default('USD'),
  terms: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(manualLineSchema).min(1, 'At least one line required'),
})
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

export const updateInvoiceSchema = z.object({
  id: z.string().uuid(),
  /** Only notes/terms editable on draft. Other field edits go through delete + create. */
  terms: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
})
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>

export const sendInvoiceSchema = z.object({
  id: z.string().uuid(),
})
export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>

export const markInvoicePaidSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().positive('Amount must be > 0'),
  paymentDate: isoDate,
  paymentMethod: z.enum(['check', 'ach', 'wire', 'card', 'cash', 'other']),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
})
export type MarkInvoicePaidInput = z.infer<typeof markInvoicePaidSchema>

export const voidInvoiceSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1, 'Reason is required').max(500),
})
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>

export const softDeleteInvoiceSchema = z.object({
  id: z.string().uuid(),
})
export type SoftDeleteInvoiceInput = z.infer<typeof softDeleteInvoiceSchema>
