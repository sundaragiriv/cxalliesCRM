import { and, desc, eq, like } from 'drizzle-orm'
import { payments } from '../../schema'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Generates the next sequential payment number for the org in the given year.
 * Format: PAY-YYYY-NNNN (per conventions §3.12).
 *
 * Phase 1: MAX+1 inside the caller's transaction. Same race-window note.
 */
export async function nextPaymentNumber(
  tx: FinanceTx,
  organizationId: string,
  year: number,
): Promise<string> {
  const prefix = `PAY-${year}-`

  const [row] = await tx
    .select({ paymentNumber: payments.paymentNumber })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, organizationId),
        like(payments.paymentNumber, `${prefix}%`),
      ),
    )
    .orderBy(desc(payments.paymentNumber))
    .limit(1)

  let nextSeq = 1
  if (row?.paymentNumber) {
    const parts = row.paymentNumber.split('-')
    const last = Number(parts[parts.length - 1])
    if (Number.isFinite(last)) nextSeq = last + 1
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}
