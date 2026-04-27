import { z } from 'zod'
import { and, asc, eq, ilike, or } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import { chartOfAccounts, corporateCards, currencies } from '@/modules/finance/schema'
import { businessLines, parties, partyRoles, organizations } from '@/modules/parties/schema'
import { active } from '@/lib/db/active'

function getOrgId(ctx: { user: unknown }): string {
  const orgId = (ctx.user as { organizationId?: string }).organizationId
  if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return orgId
}

/**
 * Form-option queries — every picker on the expense form pulls from live data.
 * No hardcoded options anywhere per conventions §3.11.
 */
export const pickerOptionsRouter = router({
  /** Active expense accounts from this org's CoA. */
  expenseAccounts: procedureWithAuth({ module: 'finance', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const rows = await db
        .select({
          id: chartOfAccounts.id,
          accountNumber: chartOfAccounts.accountNumber,
          accountName: chartOfAccounts.accountName,
        })
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.organizationId, orgId),
            eq(chartOfAccounts.accountType, 'expense'),
            eq(chartOfAccounts.isActive, true),
            active(chartOfAccounts),
          ),
        )
        .orderBy(asc(chartOfAccounts.accountNumber))
      return rows
    },
  ),

  /** Active revenue accounts from this org's CoA. */
  revenueAccounts: procedureWithAuth({ module: 'finance', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const rows = await db
        .select({
          id: chartOfAccounts.id,
          accountNumber: chartOfAccounts.accountNumber,
          accountName: chartOfAccounts.accountName,
          businessLineId: chartOfAccounts.businessLineId,
        })
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.organizationId, orgId),
            eq(chartOfAccounts.accountType, 'revenue'),
            eq(chartOfAccounts.isActive, true),
            active(chartOfAccounts),
          ),
        )
        .orderBy(asc(chartOfAccounts.accountNumber))
      return rows
    },
  ),

  /**
   * Party search for the revenue payer picker. Filters parties via
   * party_roles where role IN ('end_client', 'customer', 'vendor') —
   * vendor included for refund/contra cases per Q2 answer.
   */
  searchPayers: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(z.object({ query: z.string().trim().max(100).default(''), limit: z.number().int().min(1).max(20).default(10) }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const pattern = `%${input.query}%`

      const rows = await db
        .selectDistinct({
          id: parties.id,
          displayName: parties.displayName,
          kind: parties.kind,
          primaryEmail: parties.primaryEmail,
        })
        .from(parties)
        .innerJoin(partyRoles, eq(partyRoles.partyId, parties.id))
        .where(
          and(
            eq(parties.organizationId, orgId),
            active(parties),
            eq(partyRoles.isActive, true),
            or(
              eq(partyRoles.role, 'end_client'),
              eq(partyRoles.role, 'customer'),
              eq(partyRoles.role, 'vendor'),
            )!,
            input.query
              ? or(
                  ilike(parties.displayName, pattern),
                  ilike(parties.primaryEmail, pattern),
                )
              : undefined,
          ),
        )
        .orderBy(asc(parties.displayName))
        .limit(input.limit)

      return rows
    }),

  /** Active business lines for this org. */
  businessLines: procedureWithAuth({ module: 'finance', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const rows = await db
        .select({
          id: businessLines.id,
          slug: businessLines.slug,
          name: businessLines.name,
          kind: businessLines.kind,
        })
        .from(businessLines)
        .where(
          and(
            eq(businessLines.organizationId, orgId),
            eq(businessLines.isActive, true),
            active(businessLines),
          ),
        )
        .orderBy(asc(businessLines.displayOrder), asc(businessLines.name))
      return rows
    },
  ),

  /** Active corporate cards for this org. */
  corporateCards: procedureWithAuth({ module: 'finance', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const rows = await db
        .select({
          id: corporateCards.id,
          nickname: corporateCards.nickname,
          lastFour: corporateCards.lastFour,
          cardType: corporateCards.cardType,
        })
        .from(corporateCards)
        .where(
          and(
            eq(corporateCards.organizationId, orgId),
            eq(corporateCards.isActive, true),
            active(corporateCards),
          ),
        )
        .orderBy(asc(corporateCards.nickname))
      return rows
    },
  ),

  /** Active currencies. Returns the org's default first. */
  currencies: procedureWithAuth({ module: 'finance', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const [org] = await db
        .select({ defaultCurrency: organizations.defaultCurrency })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)

      const rows = await db
        .select({
          code: currencies.code,
          name: currencies.name,
          symbol: currencies.symbol,
          decimalDigits: currencies.decimalDigits,
        })
        .from(currencies)
        .where(eq(currencies.isActive, true))
        .orderBy(asc(currencies.code))

      return {
        defaultCurrency: org?.defaultCurrency ?? 'USD',
        currencies: rows,
      }
    },
  ),

  /**
   * Party search for the payee picker. Phase 1 narrows to vendors/suppliers
   * via party_roles; full party-list lands in P1-15.
   */
  searchPayees: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(z.object({ query: z.string().trim().max(100).default(''), limit: z.number().int().min(1).max(20).default(10) }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const pattern = `%${input.query}%`

      const rows = await db
        .selectDistinct({
          id: parties.id,
          displayName: parties.displayName,
          kind: parties.kind,
          primaryEmail: parties.primaryEmail,
        })
        .from(parties)
        .innerJoin(partyRoles, eq(partyRoles.partyId, parties.id))
        .where(
          and(
            eq(parties.organizationId, orgId),
            active(parties),
            eq(partyRoles.isActive, true),
            or(eq(partyRoles.role, 'vendor'), eq(partyRoles.role, 'supplier'))!,
            input.query
              ? or(
                  ilike(parties.displayName, pattern),
                  ilike(parties.primaryEmail, pattern),
                )
              : undefined,
          ),
        )
        .orderBy(asc(parties.displayName))
        .limit(input.limit)

      return rows
    }),

  /** Last-used expense values for this user — feeds form defaults. */
  lastUsed: procedureWithAuth({ module: 'finance', action: 'read' }).query(
    async () => {
      // Phase 1 stub: return null so the form falls back to org-level defaults.
      // P1-09 / polish pass populates by querying the user's recent expenses.
      return {
        chartOfAccountsId: null as string | null,
        businessLineId: null as string | null,
        paymentSource: null as
          | 'business_card'
          | 'personal_card_business_use'
          | 'personal_cash'
          | 'business_check'
          | 'business_ach'
          | 'vendor_paid'
          | null,
      }
    },
  ),
})
