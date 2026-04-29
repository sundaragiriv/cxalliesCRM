import { and, desc, eq, like } from 'drizzle-orm'
import { invoices } from '../../schema'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Generates the next sequential invoice number for the org in the given year.
 * Format: INV-YYYY-NNNN (per conventions §3.12, org-wide — NOT per-business-line
 * despite an early spec draft suggesting that; per-BL parallel sequences create
 * customer-facing confusion).
 *
 * Phase 1: MAX+1 inside the caller's transaction. Race-prone in concurrent
 * contention; single-user Phase 1 makes the window theoretical. Same Phase 2
 * fix as the other numbering helpers.
 */
export async function nextInvoiceNumber(
  tx: FinanceTx,
  organizationId: string,
  year: number,
): Promise<string> {
  const prefix = `INV-${year}-`

  const [row] = await tx
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        like(invoices.invoiceNumber, `${prefix}%`),
      ),
    )
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1)

  let nextSeq = 1
  if (row?.invoiceNumber) {
    const parts = row.invoiceNumber.split('-')
    const last = Number(parts[parts.length - 1])
    if (Number.isFinite(last)) nextSeq = last + 1
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}
