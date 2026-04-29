import { z } from 'zod'
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import {
  invoiceLines,
  invoices,
  payments,
  paymentApplications,
  projects,
  timeEntries,
} from '@/modules/billing/schema'
import { businessLines, parties } from '@/modules/parties/schema'
import { chartOfAccounts, expenseEntries, journalEntries, journalLines } from '@/modules/finance/schema'
import { active } from '@/lib/db/active'

function getOrgId(ctx: { user: unknown }): string {
  const orgId = (ctx.user as { organizationId?: string }).organizationId
  if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return orgId
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

export const invoicesRouter = router({
  list: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        status: z
          .enum([
            'draft',
            'sent',
            'partially_paid',
            'paid',
            'overdue',
            'void',
            'canceled',
          ])
          .optional(),
        businessLineId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)

      const wheres = [eq(invoices.organizationId, orgId), active(invoices)]
      if (input.status) wheres.push(eq(invoices.status, input.status))
      if (input.businessLineId)
        wheres.push(eq(invoices.businessLineId, input.businessLineId))

      const rows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          billToPartyId: invoices.billToPartyId,
          billToName: parties.displayName,
          businessLineId: invoices.businessLineId,
          businessLineName: businessLines.name,
          issueDate: invoices.issueDate,
          dueDate: invoices.dueDate,
          totalCents: invoices.totalCents,
          paidCents: invoices.paidCents,
          currencyCode: invoices.currencyCode,
          sentAt: invoices.sentAt,
          paidAt: invoices.paidAt,
          updatedAt: invoices.updatedAt,
        })
        .from(invoices)
        .innerJoin(parties, eq(parties.id, invoices.billToPartyId))
        .innerJoin(businessLines, eq(businessLines.id, invoices.businessLineId))
        .where(and(...wheres))
        .orderBy(desc(invoices.issueDate), desc(invoices.invoiceNumber))
        .limit(input.limit)
      return rows
    }),

  get: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)

      const [invoice] = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          billToPartyId: invoices.billToPartyId,
          billToName: parties.displayName,
          businessLineId: invoices.businessLineId,
          businessLineName: businessLines.name,
          projectId: invoices.projectId,
          issueDate: invoices.issueDate,
          dueDate: invoices.dueDate,
          periodStart: invoices.periodStart,
          periodEnd: invoices.periodEnd,
          subtotalCents: invoices.subtotalCents,
          taxCents: invoices.taxCents,
          totalCents: invoices.totalCents,
          paidCents: invoices.paidCents,
          currencyCode: invoices.currencyCode,
          sentAt: invoices.sentAt,
          paidAt: invoices.paidAt,
          voidedAt: invoices.voidedAt,
          terms: invoices.terms,
          notes: invoices.notes,
          createdAt: invoices.createdAt,
          updatedAt: invoices.updatedAt,
        })
        .from(invoices)
        .innerJoin(parties, eq(parties.id, invoices.billToPartyId))
        .innerJoin(businessLines, eq(businessLines.id, invoices.businessLineId))
        .where(
          and(
            eq(invoices.id, input.id),
            eq(invoices.organizationId, orgId),
            active(invoices),
          ),
        )
        .limit(1)
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' })

      const lines = await db
        .select({
          id: invoiceLines.id,
          lineNumber: invoiceLines.lineNumber,
          description: invoiceLines.description,
          kind: invoiceLines.kind,
          projectId: invoiceLines.projectId,
          quantity: invoiceLines.quantity,
          unitPriceCents: invoiceLines.unitPriceCents,
          amountCents: invoiceLines.amountCents,
          currencyCode: invoiceLines.currencyCode,
          chartOfAccountsId: invoiceLines.chartOfAccountsId,
          accountName: chartOfAccounts.accountName,
        })
        .from(invoiceLines)
        .leftJoin(
          chartOfAccounts,
          eq(chartOfAccounts.id, invoiceLines.chartOfAccountsId),
        )
        .where(eq(invoiceLines.invoiceId, invoice.id))
        .orderBy(asc(invoiceLines.lineNumber))

      return { ...invoice, lines }
    }),

  /** Returns the journal entries posted from this invoice (send + reversals). */
  journal: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(z.object({ invoiceId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const entries = await db
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.organizationId, orgId),
            eq(journalEntries.sourceTable, 'billing_invoices'),
            eq(journalEntries.sourceId, input.invoiceId),
          ),
        )
        .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNumber))
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
   * Preview invoice lines for a project + period before generation. Reads the
   * same source data the generator would, returns line drafts. Used by the
   * generator UI to show what'll happen before the user confirms.
   */
  previewFromProject: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(
      z.object({
        projectId: z.string().uuid(),
        periodStart: isoDate,
        periodEnd: isoDate,
      }),
    )
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const [project] = await db
        .select({
          id: projects.id,
          name: projects.name,
          currencyCode: projects.currencyCode,
          endClientPartyId: projects.endClientPartyId,
          businessLineId: projects.businessLineId,
        })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, orgId),
            active(projects),
          ),
        )
        .limit(1)
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' })

      const sourceTimes = await db
        .select({
          id: timeEntries.id,
          entryDate: timeEntries.entryDate,
          description: timeEntries.description,
          hours: timeEntries.hours,
          billableRateCents: timeEntries.billableRateCents,
          currencyCode: timeEntries.currencyCode,
        })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.organizationId, orgId),
            eq(timeEntries.projectId, input.projectId),
            eq(timeEntries.status, 'approved'),
            gte(timeEntries.entryDate, input.periodStart),
            lte(timeEntries.entryDate, input.periodEnd),
            active(timeEntries),
            isNull(timeEntries.invoiceLineId),
          ),
        )
        .orderBy(asc(timeEntries.entryDate))

      const sourceExpenses = await db
        .select({
          id: expenseEntries.id,
          entryDate: expenseEntries.entryDate,
          description: expenseEntries.description,
          amountCents: expenseEntries.amountCents,
          currencyCode: expenseEntries.currencyCode,
        })
        .from(expenseEntries)
        .where(
          and(
            eq(expenseEntries.organizationId, orgId),
            eq(expenseEntries.projectId, input.projectId),
            eq(expenseEntries.isBillable, true),
            gte(expenseEntries.entryDate, input.periodStart),
            lte(expenseEntries.entryDate, input.periodEnd),
            active(expenseEntries),
            isNull(expenseEntries.invoiceId),
          ),
        )
        .orderBy(asc(expenseEntries.entryDate))

      return { project, sourceTimes, sourceExpenses }
    }),

  count: procedureWithAuth({ module: 'billing', action: 'read' }).query(
    async ({ ctx }) => {
      const orgId = getOrgId(ctx)
      const [row] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(invoices)
        .where(and(eq(invoices.organizationId, orgId), active(invoices)))
      return row?.count ?? 0
    },
  ),
})

export const paymentsRouter = router({
  listForInvoice: procedureWithAuth({ module: 'billing', action: 'read' })
    .input(z.object({ invoiceId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = getOrgId(ctx)
      const rows = await db
        .select({
          id: payments.id,
          paymentNumber: payments.paymentNumber,
          paymentDate: payments.paymentDate,
          amountCents: payments.amountCents,
          currencyCode: payments.currencyCode,
          paymentMethod: payments.paymentMethod,
          reference: payments.reference,
          appliedCents: paymentApplications.appliedCents,
        })
        .from(paymentApplications)
        .innerJoin(payments, eq(payments.id, paymentApplications.paymentId))
        .where(
          and(
            eq(paymentApplications.organizationId, orgId),
            eq(paymentApplications.invoiceId, input.invoiceId),
          ),
        )
        .orderBy(desc(payments.paymentDate))
      return rows
    }),
})
