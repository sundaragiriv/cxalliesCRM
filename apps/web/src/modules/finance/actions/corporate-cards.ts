'use server'

import { and, eq } from 'drizzle-orm'
import { corporateCards } from '../schema'
import { defineAction } from '@/lib/actions/define-action'
import { active } from '@/lib/db/active'
import { emitFinanceEvent } from '../lib/event-emitter'
import {
  createCorporateCardSchema,
  softDeleteCorporateCardSchema,
  updateCorporateCardSchema,
} from './corporate-cards-schema'

const SOURCE_TABLE = 'finance_corporate_cards'

export const createCorporateCard = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'insert' },
  schema: createCorporateCardSchema,
  handler: async (input, ctx) => {
    const [row] = await ctx.tx
      .insert(corporateCards)
      .values({
        organizationId: ctx.organizationId,
        nickname: input.nickname,
        lastFour: input.lastFour,
        cardType: input.cardType,
        ownership: input.ownership,
        holderUserId: input.holderUserId ?? ctx.userId,
        isActive: input.isActive,
        notes: input.notes ?? null,
      })
      .returning()

    if (!row) throw new Error('Failed to insert corporate card')

    await emitFinanceEvent(ctx.tx, 'finance.corporateCard.created', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Added card ${row.nickname} (****${row.lastFour})`,
    })

    return { result: { id: row.id }, recordId: row.id, after: row }
  },
})

export const updateCorporateCard = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: updateCorporateCardSchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(corporateCards)
      .where(
        and(
          eq(corporateCards.id, input.id),
          eq(corporateCards.organizationId, ctx.organizationId),
          active(corporateCards),
        ),
      )
      .limit(1)

    if (!before) throw new Error('Card not found')

    const [row] = await ctx.tx
      .update(corporateCards)
      .set({
        nickname: input.nickname,
        lastFour: input.lastFour,
        cardType: input.cardType,
        ownership: input.ownership,
        holderUserId: input.holderUserId ?? null,
        isActive: input.isActive,
        notes: input.notes ?? null,
      })
      .where(
        and(
          eq(corporateCards.id, input.id),
          eq(corporateCards.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to update corporate card')

    await emitFinanceEvent(ctx.tx, 'finance.corporateCard.updated', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Updated card ${row.nickname} (****${row.lastFour})`,
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const softDeleteCorporateCard = defineAction({
  permission: { module: 'finance', action: 'delete' },
  audit: { table: SOURCE_TABLE, action: 'soft_delete' },
  schema: softDeleteCorporateCardSchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(corporateCards)
      .where(
        and(
          eq(corporateCards.id, input.id),
          eq(corporateCards.organizationId, ctx.organizationId),
          active(corporateCards),
        ),
      )
      .limit(1)

    if (!before) throw new Error('Card not found')

    const [row] = await ctx.tx
      .update(corporateCards)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(corporateCards.id, input.id),
          eq(corporateCards.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to soft-delete corporate card')

    await emitFinanceEvent(ctx.tx, 'finance.corporateCard.deleted', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Removed card ${before.nickname} (****${before.lastFour})`,
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})
