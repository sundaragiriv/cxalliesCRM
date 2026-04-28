import { activities } from '@/db/shared-tables'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Phase 1 event emitter — writes a row to `activities` per architecture §4.2's
 * "synchronous in-process subscriber: activity logger". When a real event bus
 * lands (Phase 2+), the body of this function swaps; callers don't change.
 *
 * The `tx` parameter ensures the activity row commits in the same transaction
 * as the originating mutation (per the P1-08 transaction-boundary refactor).
 *
 * Event naming follows architecture §4.3: `{module}.{entity}.{verb_past_tense}`.
 */
export type FinanceEventKind =
  | 'finance.expense.created'
  | 'finance.expense.updated'
  | 'finance.expense.deleted'
  | 'finance.revenue.created'
  | 'finance.revenue.updated'
  | 'finance.revenue.deleted'
  | 'finance.expenseReport.created'
  | 'finance.expenseReport.updated'
  | 'finance.expenseReport.submitted'
  | 'finance.expenseReport.approved'
  | 'finance.expenseReport.rejected'
  | 'finance.expenseReport.reopened'
  | 'finance.expenseReport.reimbursed'
  | 'finance.expenseReport.deleted'
  | 'finance.corporateCard.created'
  | 'finance.corporateCard.updated'
  | 'finance.corporateCard.deleted'
  | 'finance.taxEstimate.paid'

export interface FinanceEventPayload {
  organizationId: string
  actorUserId: string
  partyId?: string | null
  businessLineId?: string | null
  entityTable: string
  entityId: string
  summary: string
  metadata?: Record<string, unknown>
}

export async function emitFinanceEvent(
  tx: FinanceTx,
  kind: FinanceEventKind,
  payload: FinanceEventPayload,
): Promise<void> {
  await tx.insert(activities).values({
    organizationId: payload.organizationId,
    partyId: payload.partyId ?? null,
    kind,
    entityTable: payload.entityTable,
    entityId: payload.entityId,
    businessLineId: payload.businessLineId ?? null,
    actorUserId: payload.actorUserId,
    summary: payload.summary,
    metadata: payload.metadata ?? {},
  })
}
