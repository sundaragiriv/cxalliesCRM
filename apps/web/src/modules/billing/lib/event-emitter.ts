import { activities } from '@/db/shared-tables'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Phase 1 event emitter — writes a row to `activities` per architecture §4.2.
 * Mirrors the finance/lib/event-emitter pattern from P1-07/08.
 *
 * `tx` ensures the activity row commits in the same transaction as the
 * originating mutation (per the P1-08 transaction-boundary refactor).
 *
 * Event naming follows architecture §4.3: `{module}.{entity}.{verb_past_tense}`.
 */
export type BillingEventKind =
  | 'billing.timeEntry.created'
  | 'billing.timeEntry.updated'
  | 'billing.timeEntry.deleted'
  | 'billing.timesheet.created'
  | 'billing.timesheet.submitted'
  | 'billing.timesheet.approved'
  | 'billing.timesheet.rejected'
  | 'billing.timesheet.reopened'
  | 'billing.timesheet.deleted'

export interface BillingEventPayload {
  organizationId: string
  actorUserId: string
  partyId?: string | null
  businessLineId?: string | null
  entityTable: string
  entityId: string
  summary: string
  metadata?: Record<string, unknown>
}

export async function emitBillingEvent(
  tx: FinanceTx,
  kind: BillingEventKind,
  payload: BillingEventPayload,
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
