/**
 * R2 key shape for generated invoice PDFs (per ADR-0006 §6.2 +
 * ADR-0004 §4.3 prefix convention).
 *
 *   {org_id}/billing/invoices/{invoice_id}/v{N}/invoice-{number}.pdf
 *
 * Versioning preserves prior-as-sent PDFs across regeneration (re-send,
 * brand swap in P1-25, etc.). The version segment is always
 * `v{positiveInt}` so glob queries by version stay simple.
 */
export function buildInvoicePdfR2Key(parts: {
  organizationId: string
  invoiceId: string
  invoiceNumber: string
  version: number
}): string {
  if (!Number.isInteger(parts.version) || parts.version < 1) {
    throw new Error(`Invalid PDF version: ${parts.version}`)
  }
  const safeNumber = parts.invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, '_')
  return [
    parts.organizationId,
    'billing',
    'invoices',
    parts.invoiceId,
    `v${parts.version}`,
    `invoice-${safeNumber}.pdf`,
  ].join('/')
}
