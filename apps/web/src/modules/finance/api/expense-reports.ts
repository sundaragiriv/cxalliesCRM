import { z } from 'zod'
import { aliasedTable, and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import {
  chartOfAccounts,
  expenseEntries,
  expenseReports,
  journalEntries,
  journalLines,
} from '@/modules/finance/schema'
import { businessLines, parties } from '@/modules/parties/schema'
import { users } from '@/modules/auth/schema'
import { active } from '@/lib/db/active'

function getOrgId(ctx: { user: unknown }): string {
  const orgId = (ctx.user as { organizationId?: string }).organizationId
  if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return orgId
}

const reportStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'reimbursed',
])

export const expenseReportsRouter = router({
  list: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(
      z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        status: reportStatusSchema.optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)

      const wheres = [
        eq(expenseReports.organizationId, orgId),
        active(expenseReports),
      ]
      if (input.status) wheres.push(eq(expenseReports.status, input.status))

      const subjectParty = aliasedTable(parties, 'subject_party')

      const rows = await db
        .select({
          id: expenseReports.id,
          reportNumber: expenseReports.reportNumber,
          purpose: expenseReports.purpose,
          status: expenseReports.status,
          totalCents: expenseReports.totalCents,
          periodStart: expenseReports.periodStart,
          periodEnd: expenseReports.periodEnd,
          businessLineId: expenseReports.businessLineId,
          businessLineName: businessLines.name,
          subjectPartyId: expenseReports.subjectPartyId,
          subjectPartyName: subjectParty.displayName,
          submittedAt: expenseReports.submittedAt,
          approvedAt: expenseReports.approvedAt,
          reimbursedAt: expenseReports.reimbursedAt,
          updatedAt: expenseReports.updatedAt,
        })
        .from(expenseReports)
        .leftJoin(
          businessLines,
          eq(businessLines.id, expenseReports.businessLineId),
        )
        .leftJoin(subjectParty, eq(subjectParty.id, expenseReports.subjectPartyId))
        .where(and(...wheres))
        .orderBy(desc(expenseReports.updatedAt))
        .limit(input.limit + 1)

      const hasMore = rows.length > input.limit
      const items = rows.slice(0, input.limit)
      const nextCursor = hasMore ? items[items.length - 1]?.id : null
      return { items, nextCursor }
    }),

  get: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const subjectParty = aliasedTable(parties, 'subject_party')

      const [report] = await db
        .select({
          id: expenseReports.id,
          reportNumber: expenseReports.reportNumber,
          purpose: expenseReports.purpose,
          status: expenseReports.status,
          totalCents: expenseReports.totalCents,
          periodStart: expenseReports.periodStart,
          periodEnd: expenseReports.periodEnd,
          businessLineId: expenseReports.businessLineId,
          businessLineName: businessLines.name,
          projectId: expenseReports.projectId,
          subjectPartyId: expenseReports.subjectPartyId,
          subjectPartyName: subjectParty.displayName,
          submittedByUserId: expenseReports.submittedByUserId,
          submittedAt: expenseReports.submittedAt,
          approvedAt: expenseReports.approvedAt,
          approvedByUserId: expenseReports.approvedByUserId,
          reimbursedAt: expenseReports.reimbursedAt,
          reimbursedByUserId: expenseReports.reimbursedByUserId,
          createdAt: expenseReports.createdAt,
          updatedAt: expenseReports.updatedAt,
        })
        .from(expenseReports)
        .leftJoin(
          businessLines,
          eq(businessLines.id, expenseReports.businessLineId),
        )
        .leftJoin(subjectParty, eq(subjectParty.id, expenseReports.subjectPartyId))
        .where(
          and(
            eq(expenseReports.id, input.id),
            eq(expenseReports.organizationId, orgId),
            active(expenseReports),
          ),
        )
        .limit(1)

      if (!report) throw new TRPCError({ code: 'NOT_FOUND' })

      const expenses = await db
        .select({
          id: expenseEntries.id,
          entryDate: expenseEntries.entryDate,
          description: expenseEntries.description,
          amountCents: expenseEntries.amountCents,
          currencyCode: expenseEntries.currencyCode,
          chartOfAccountsId: expenseEntries.chartOfAccountsId,
          accountName: chartOfAccounts.accountName,
          businessLineId: expenseEntries.businessLineId,
          businessLineName: businessLines.name,
          payeeDisplayName: parties.displayName,
          isBillable: expenseEntries.isBillable,
          receiptFileId: expenseEntries.receiptFileId,
        })
        .from(expenseEntries)
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, expenseEntries.chartOfAccountsId))
        .innerJoin(businessLines, eq(businessLines.id, expenseEntries.businessLineId))
        .leftJoin(parties, eq(parties.id, expenseEntries.payeePartyId))
        .where(
          and(
            eq(expenseEntries.organizationId, orgId),
            eq(expenseEntries.expenseReportId, report.id),
            active(expenseEntries),
          ),
        )
        .orderBy(asc(expenseEntries.entryDate), asc(expenseEntries.id))

      return { ...report, expenses }
    }),

  /** Returns the journal entries + lines for this report (approval, reimbursement, reversals). */
  journal: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(z.object({ reportId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const entries = await db
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.organizationId, orgId),
            eq(journalEntries.sourceTable, 'finance_expense_reports'),
            eq(journalEntries.sourceId, input.reportId),
          ),
        )
        .orderBy(journalEntries.entryDate, journalEntries.entryNumber)

      const lines = entries.length
        ? await db
            .select()
            .from(journalLines)
            .where(
              or(...entries.map((e) => eq(journalLines.journalEntryId, e.id)))!,
            )
            .orderBy(journalLines.journalEntryId, journalLines.lineNumber)
        : []

      return { entries, lines }
    }),

  /**
   * Reimbursable expenses eligible to add to a draft report. Filters:
   *   - is_reimbursable = true
   *   - expense_report_id IS NULL
   *   - active (not soft-deleted)
   * Used by the "create report from selected expenses" flow + the "add expenses"
   * picker on the report detail page.
   */
  eligibleExpenses: procedureWithAuth({ module: 'finance', action: 'read' })
    .input(
      z.object({
        currencyCode: z.string().length(3).optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)

      const wheres = [
        eq(expenseEntries.organizationId, orgId),
        active(expenseEntries),
        eq(expenseEntries.isReimbursable, true),
        isNull(expenseEntries.expenseReportId),
      ]
      if (input.currencyCode) {
        wheres.push(eq(expenseEntries.currencyCode, input.currencyCode))
      }

      const rows = await db
        .select({
          id: expenseEntries.id,
          entryDate: expenseEntries.entryDate,
          description: expenseEntries.description,
          amountCents: expenseEntries.amountCents,
          currencyCode: expenseEntries.currencyCode,
          accountName: chartOfAccounts.accountName,
          businessLineName: businessLines.name,
        })
        .from(expenseEntries)
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, expenseEntries.chartOfAccountsId))
        .innerJoin(businessLines, eq(businessLines.id, expenseEntries.businessLineId))
        .where(and(...wheres))
        .orderBy(desc(expenseEntries.entryDate))
        .limit(input.limit)

      return rows
    }),

  count: procedureWithAuth({ module: 'finance', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const [row] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(expenseReports)
        .where(
          and(
            eq(expenseReports.organizationId, orgId),
            active(expenseReports),
          ),
        )
      return row?.count ?? 0
    },
  ),

  /** Used by the "for whom?" subject-party display on the new-report form. */
  myDefaultSubjectParty: procedureWithAuth({ module: 'finance', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const userId = (ctx.user as { id?: string }).id
      if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED' })

      const [row] = await db
        .select({
          partyId: users.partyId,
          displayName: parties.displayName,
        })
        .from(users)
        .leftJoin(parties, eq(parties.id, users.partyId))
        .where(and(eq(users.id, userId), eq(parties.organizationId, orgId)))
        .limit(1)

      return row ?? { partyId: null, displayName: null }
    },
  ),
})
