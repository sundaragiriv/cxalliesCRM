import { z } from 'zod'
import { and, asc, eq, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import { corporateCards } from '@/modules/finance/schema'
import { active } from '@/lib/db/active'

function getOrgId(ctx: { user: unknown }): string {
  const orgId = (ctx.user as { organizationId?: string }).organizationId
  if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return orgId
}

export const corporateCardsRouter = router({
  list: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(
      z.object({
        includeInactive: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const wheres = [
        eq(corporateCards.organizationId, orgId),
        active(corporateCards),
      ]
      if (!input.includeInactive) {
        wheres.push(eq(corporateCards.isActive, true))
      }

      const rows = await db
        .select({
          id: corporateCards.id,
          nickname: corporateCards.nickname,
          lastFour: corporateCards.lastFour,
          cardType: corporateCards.cardType,
          ownership: corporateCards.ownership,
          holderUserId: corporateCards.holderUserId,
          isActive: corporateCards.isActive,
          notes: corporateCards.notes,
          updatedAt: corporateCards.updatedAt,
        })
        .from(corporateCards)
        .where(and(...wheres))
        .orderBy(asc(corporateCards.nickname))
      return rows
    }),

  get: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const [row] = await db
        .select()
        .from(corporateCards)
        .where(
          and(
            eq(corporateCards.id, input.id),
            eq(corporateCards.organizationId, orgId),
            active(corporateCards),
          ),
        )
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return row
    }),

  count: procedureWithAuth({ module: 'finance', action: 'read' }).query(async ({ ctx }) => {
    const orgId = getOrgId(ctx)
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(corporateCards)
      .where(
        and(
          eq(corporateCards.organizationId, orgId),
          eq(corporateCards.isActive, true),
          active(corporateCards),
        ),
      )
    return row?.count ?? 0
  }),
})
