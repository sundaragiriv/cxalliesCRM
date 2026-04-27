import { db } from '@/db/client'
import { activities } from '@/db/shared-tables'

/**
 * Phase 1 event emitter — writes a row to `activities` per architecture §4.2's
 * "synchronous in-process subscriber: activity logger". When a real event bus
 * lands (Phase 2+), the body of this function swaps; callers don't change.
 *
 * Event naming follows architecture §4.3: `{module}.{entity}.{verb_past_tense}`.
 */
export type FinanceEventKind =
  | 'finance.expense.created'
  | 'finance.expense.updated'
  | 'finance.expense.deleted'

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
  kind: FinanceEventKind,
  payload: FinanceEventPayload,
): Promise<void> {
  await db.insert(activities).values({
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
