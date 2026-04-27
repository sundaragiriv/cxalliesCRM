'use server'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { expenseEntries, expenseReports } from '../schema'
import { users } from '@/modules/auth/schema'
import { defineAction } from '@/lib/actions/define-action'
import { active } from '@/lib/db/active'
import { emitFinanceEvent } from '../lib/event-emitter'
import { formatMoney } from '../lib/format-money'
import { nextReportNumber } from '../lib/expense-reports/next-report-number'
import {
  assertTransition,
  canEditContent,
  canSoftDelete,
  type ExpenseReportStatus,
} from '../lib/expense-reports/state-machine'
import { findUnreversedJournalEntries } from '../lib/journal/find-unreversed'
import { postExpenseReportApprovalJournal } from '../lib/journal/post-expense-report-approval'
import { postExpenseReportReimbursementJournal } from '../lib/journal/post-expense-report-reimbursement'
import { reverseJournalEntry } from '../lib/journal/reverse-entry'
import {
  addExpensesToReportSchema,
  approveExpenseReportSchema,
  createExpenseReportSchema,
  markReimbursedSchema,
  rejectExpenseReportSchema,
  removeExpensesFromReportSchema,
  reopenExpenseReportSchema,
  softDeleteExpenseReportSchema,
  submitExpenseReportSchema,
  updateExpenseReportSchema,
} from './expense-reports-schema'
import type { FinanceTx } from '@/lib/audit/with-audit'

const SOURCE_TABLE = 'finance_expense_reports'

// ---------- helpers ----------

async function loadReport(
  tx: FinanceTx,
  organizationId: string,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(expenseReports)
    .where(
      and(
        eq(expenseReports.id, id),
        eq(expenseReports.organizationId, organizationId),
        active(expenseReports),
      ),
    )
    .limit(1)
  return row
}

async function recomputeReportTotal(
  tx: FinanceTx,
  organizationId: string,
  reportId: string,
): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${expenseEntries.amountCents}), 0)::text`,
    })
    .from(expenseEntries)
    .where(
      and(
        eq(expenseEntries.organizationId, organizationId),
        eq(expenseEntries.expenseReportId, reportId),
        active(expenseEntries),
      ),
    )
  const total = Number(row?.total ?? 0)
  await tx
    .update(expenseReports)
    .set({ totalCents: total })
    .where(eq(expenseReports.id, reportId))
  return total
}

async function attachExpensesToReport(
  tx: FinanceTx,
  organizationId: string,
  reportId: string,
  expenseIds: readonly string[],
): Promise<{ attached: number; currencyCode: string }> {
  if (expenseIds.length === 0) {
    return { attached: 0, currencyCode: 'USD' }
  }

  // Load the candidate expenses + any already on this report (for currency check).
  const candidates = await tx
    .select({
      id: expenseEntries.id,
      currencyCode: expenseEntries.currencyCode,
      isReimbursable: expenseEntries.isReimbursable,
      expenseReportId: expenseEntries.expenseReportId,
      amountCents: expenseEntries.amountCents,
    })
    .from(expenseEntries)
    .where(
      and(
        eq(expenseEntries.organizationId, organizationId),
        active(expenseEntries),
        inArray(expenseEntries.id, [...expenseIds]),
      ),
    )

  if (candidates.length !== expenseIds.length) {
    throw new Error(
      'One or more expenses were not found in this organization or are deleted.',
    )
  }
  for (const c of candidates) {
    if (!c.isReimbursable) {
      throw new Error('All expenses must be marked reimbursable to attach to a report.')
    }
    if (c.expenseReportId && c.expenseReportId !== reportId) {
      throw new Error(
        'One or more expenses are already attached to a different report.',
      )
    }
  }

  // Currency check: all candidates + already-attached must share currency.
  const existing = await tx
    .select({ currencyCode: expenseEntries.currencyCode })
    .from(expenseEntries)
    .where(
      and(
        eq(expenseEntries.organizationId, organizationId),
        eq(expenseEntries.expenseReportId, reportId),
        active(expenseEntries),
      ),
    )

  const currencies = new Set<string>([
    ...candidates.map((c) => c.currencyCode),
    ...existing.map((e) => e.currencyCode),
  ])
  if (currencies.size > 1) {
    throw new Error(
      `Mixed currencies on report not allowed: ${Array.from(currencies).join(', ')}.`,
    )
  }

  // Attach (idempotent — already-attached rows of this report are skipped by the WHERE).
  const updated = await tx
    .update(expenseEntries)
    .set({ expenseReportId: reportId })
    .where(
      and(
        eq(expenseEntries.organizationId, organizationId),
        inArray(expenseEntries.id, [...expenseIds]),
        eq(expenseEntries.isReimbursable, true),
        sql`${expenseEntries.expenseReportId} IS NULL`,
      ),
    )
    .returning({ id: expenseEntries.id })

  return {
    attached: updated.length,
    currencyCode: candidates[0]?.currencyCode ?? 'USD',
  }
}

// ---------- actions ----------

export const createExpenseReport = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'insert' },
  schema: createExpenseReportSchema,
  handler: async (input, ctx) => {
    if (input.periodEnd < input.periodStart) {
      throw new Error('Period end must be on or after period start.')
    }

    const reportNumber = await nextReportNumber(
      ctx.tx,
      ctx.organizationId,
      Number(input.periodStart.slice(0, 4)),
    )

    // Subject party defaults to the current user's linked party (Phase 1
    // single-user). Looked up via the user→party link set up in P1-04.
    const subjectPartyId = await resolveSubjectPartyId(ctx.tx, ctx.userId)

    const [row] = await ctx.tx
      .insert(expenseReports)
      .values({
        organizationId: ctx.organizationId,
        reportNumber,
        submittedByUserId: ctx.userId,
        subjectPartyId,
        businessLineId: input.businessLineId ?? null,
        projectId: input.projectId ?? null,
        purpose: input.purpose,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: 'draft',
        totalCents: 0,
      })
      .returning()

    if (!row) throw new Error('Failed to insert expense report')

    if (input.expenseIds && input.expenseIds.length > 0) {
      await attachExpensesToReport(
        ctx.tx,
        ctx.organizationId,
        row.id,
        input.expenseIds,
      )
      await recomputeReportTotal(ctx.tx, ctx.organizationId, row.id)
    }

    await emitFinanceEvent(ctx.tx, 'finance.expenseReport.created', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: subjectPartyId,
      businessLineId: input.businessLineId ?? null,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Created expense report ${reportNumber} — ${input.purpose}`,
      metadata: { reportNumber, attachedCount: input.expenseIds?.length ?? 0 },
    })

    return { result: { id: row.id, reportNumber }, recordId: row.id, after: row }
  },
})

export const updateExpenseReport = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: updateExpenseReportSchema,
  handler: async (input, ctx) => {
    const before = await loadReport(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Expense report not found')
    if (!canEditContent(before.status as ExpenseReportStatus)) {
      throw new Error(
        `Cannot edit report content while status is '${before.status}'. Reject and reopen first.`,
      )
    }
    if (input.periodEnd < input.periodStart) {
      throw new Error('Period end must be on or after period start.')
    }

    const [row] = await ctx.tx
      .update(expenseReports)
      .set({
        purpose: input.purpose,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        businessLineId: input.businessLineId ?? null,
        projectId: input.projectId ?? null,
      })
      .where(
        and(
          eq(expenseReports.id, input.id),
          eq(expenseReports.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to update expense report')

    await emitFinanceEvent(ctx.tx, 'finance.expenseReport.updated', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: row.subjectPartyId,
      businessLineId: row.businessLineId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Updated expense report ${row.reportNumber}`,
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const addExpensesToReport = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: addExpensesToReportSchema,
  handler: async (input, ctx) => {
    const before = await loadReport(ctx.tx, ctx.organizationId, input.reportId)
    if (!before) throw new Error('Expense report not found')
    if (!canEditContent(before.status as ExpenseReportStatus)) {
      throw new Error(`Cannot modify expenses on a ${before.status} report.`)
    }

    const { attached } = await attachExpensesToReport(
      ctx.tx,
      ctx.organizationId,
      input.reportId,
      input.expenseIds,
    )
    const total = await recomputeReportTotal(
      ctx.tx,
      ctx.organizationId,
      input.reportId,
    )

    await emitFinanceEvent(ctx.tx, 'finance.expenseReport.updated', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: before.subjectPartyId,
      businessLineId: before.businessLineId,
      entityTable: SOURCE_TABLE,
      entityId: input.reportId,
      summary: `Added ${attached} expense${attached === 1 ? '' : 's'} to ${before.reportNumber}`,
      metadata: { attached, totalCents: total },
    })

    return {
      result: { reportId: input.reportId, attached, totalCents: total },
      recordId: input.reportId,
    }
  },
})

export const removeExpensesFromReport = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: removeExpensesFromReportSchema,
  handler: async (input, ctx) => {
    const before = await loadReport(ctx.tx, ctx.organizationId, input.reportId)
    if (!before) throw new Error('Expense report not found')
    if (!canEditContent(before.status as ExpenseReportStatus)) {
      throw new Error(`Cannot modify expenses on a ${before.status} report.`)
    }

    const detached = await ctx.tx
      .update(expenseEntries)
      .set({ expenseReportId: null })
      .where(
        and(
          eq(expenseEntries.organizationId, ctx.organizationId),
          eq(expenseEntries.expenseReportId, input.reportId),
          inArray(expenseEntries.id, [...input.expenseIds]),
        ),
      )
      .returning({ id: expenseEntries.id })

    const total = await recomputeReportTotal(
      ctx.tx,
      ctx.organizationId,
      input.reportId,
    )

    await emitFinanceEvent(ctx.tx, 'finance.expenseReport.updated', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: before.subjectPartyId,
      businessLineId: before.businessLineId,
      entityTable: SOURCE_TABLE,
      entityId: input.reportId,
      summary: `Removed ${detached.length} expense${detached.length === 1 ? '' : 's'} from ${before.reportNumber}`,
      metadata: { detached: detached.length, totalCents: total },
    })

    return {
      result: { reportId: input.reportId, detached: detached.length, totalCents: total },
      recordId: input.reportId,
    }
  },
})

export const submitExpenseReport = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: submitExpenseReportSchema,
  handler: async (input, ctx) => {
    const before = await loadReport(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Expense report not found')
    assertTransition(before.status as ExpenseReportStatus, 'submitted')

    // Validate: at least one expense, all share currency.
    const expenses = await ctx.tx
      .select({
        id: expenseEntries.id,
        currencyCode: expenseEntries.currencyCode,
      })
      .from(expenseEntries)
      .where(
        and(
          eq(expenseEntries.organizationId, ctx.organizationId),
          eq(expenseEntries.expenseReportId, input.id),
          active(expenseEntries),
        ),
      )

    if (expenses.length === 0) {
      throw new Error('Cannot submit an empty report. Add at least one expense.')
    }
    const currencies = new Set(expenses.map((e) => e.currencyCode))
    if (currencies.size > 1) {
      throw new Error(
        `Cannot submit a report with mixed currencies: ${Array.from(currencies).join(', ')}.`,
      )
    }

    const total = await recomputeReportTotal(
      ctx.tx,
      ctx.organizationId,
      input.id,
    )

    const [row] = await ctx.tx
      .update(expenseReports)
      .set({ status: 'submitted', submittedAt: new Date() })
      .where(
        and(
          eq(expenseReports.id, input.id),
          eq(expenseReports.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to submit expense report')

    await emitFinanceEvent(ctx.tx, 'finance.expenseReport.submitted', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: row.subjectPartyId,
      businessLineId: row.businessLineId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Submitted ${row.reportNumber} — ${formatMoney(total)}`,
      metadata: { totalCents: total, expenseCount: expenses.length },
    })

    return {
      result: { id: row.id, status: row.status },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const approveExpenseReport = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: approveExpenseReportSchema,
  handler: async (input, ctx) => {
    const before = await loadReport(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Expense report not found')
    assertTransition(before.status as ExpenseReportStatus, 'approved')

    // Reload fresh expenses + their account ids for the multi-line journal.
    const expenses = await ctx.tx
      .select({
        id: expenseEntries.id,
        chartOfAccountsId: expenseEntries.chartOfAccountsId,
        amountCents: expenseEntries.amountCents,
        currencyCode: expenseEntries.currencyCode,
        businessLineId: expenseEntries.businessLineId,
        partyId: expenseEntries.payeePartyId,
        description: expenseEntries.description,
      })
      .from(expenseEntries)
      .where(
        and(
          eq(expenseEntries.organizationId, ctx.organizationId),
          eq(expenseEntries.expenseReportId, before.id),
          active(expenseEntries),
        ),
      )

    if (expenses.length === 0) {
      throw new Error('Cannot approve an empty report.')
    }
    const currencies = new Set(expenses.map((e) => e.currencyCode))
    if (currencies.size > 1) {
      throw new Error('Cannot approve a report with mixed currencies.')
    }

    const today = new Date().toISOString().slice(0, 10)
    const journal = await postExpenseReportApprovalJournal(ctx.tx, {
      organizationId: ctx.organizationId,
      reportId: before.id,
      reportNumber: before.reportNumber,
      entryDate: today,
      currencyCode: expenses[0]!.currencyCode,
      reportPurpose: before.purpose,
      expenses: expenses.map((e) => ({
        expenseId: e.id,
        chartOfAccountsId: e.chartOfAccountsId,
        amountCents: e.amountCents,
        businessLineId: e.businessLineId,
        partyId: e.partyId,
        description: e.description,
      })),
    })

    const [row] = await ctx.tx
      .update(expenseReports)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        approvedByUserId: ctx.userId,
        totalCents: journal.totalCents,
      })
      .where(
        and(
          eq(expenseReports.id, before.id),
          eq(expenseReports.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to approve expense report')

    await emitFinanceEvent(ctx.tx, 'finance.expenseReport.approved', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: row.subjectPartyId,
      businessLineId: row.businessLineId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Approved ${row.reportNumber} — ${formatMoney(journal.totalCents)}`,
      metadata: {
        totalCents: journal.totalCents,
        approvalJournalEntryNumber: journal.entryNumber,
        notes: input.notes ?? null,
      },
    })

    return {
      result: {
        id: row.id,
        status: row.status,
        approvalJournalEntryNumber: journal.entryNumber,
      },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const rejectExpenseReport = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: rejectExpenseReportSchema,
  handler: async (input, ctx) => {
    const before = await loadReport(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Expense report not found')
    assertTransition(before.status as ExpenseReportStatus, 'rejected')

    let reversedCount = 0
    if (before.status === 'approved') {
      const unreversed = await findUnreversedJournalEntries(
        ctx.tx,
        ctx.organizationId,
        SOURCE_TABLE,
        before.id,
      )
      for (const entry of unreversed) {
        await reverseJournalEntry(ctx.tx, {
          originalEntryId: entry.id,
          organizationId: ctx.organizationId,
          reason: `Report ${before.reportNumber} rejected: ${input.reason}`,
        })
        reversedCount += 1
      }
    }

    const [row] = await ctx.tx
      .update(expenseReports)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(expenseReports.id, before.id),
          eq(expenseReports.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to reject expense report')

    await emitFinanceEvent(ctx.tx, 'finance.expenseReport.rejected', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: row.subjectPartyId,
      businessLineId: row.businessLineId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Rejected ${row.reportNumber} — ${input.reason}`,
      metadata: {
        reason: input.reason,
        reversedJournalEntries: reversedCount,
        priorStatus: before.status,
      },
    })

    return {
      result: { id: row.id, status: row.status, reversedJournalEntries: reversedCount },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const reopenExpenseReport = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: reopenExpenseReportSchema,
  handler: async (input, ctx) => {
    const before = await loadReport(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Expense report not found')
    assertTransition(before.status as ExpenseReportStatus, 'draft')

    const [row] = await ctx.tx
      .update(expenseReports)
      .set({
        status: 'draft',
        submittedAt: null,
        approvedAt: null,
        approvedByUserId: null,
      })
      .where(
        and(
          eq(expenseReports.id, before.id),
          eq(expenseReports.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to reopen expense report')

    await emitFinanceEvent(ctx.tx, 'finance.expenseReport.reopened', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: row.subjectPartyId,
      businessLineId: row.businessLineId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Reopened ${row.reportNumber} for editing`,
    })

    return {
      result: { id: row.id, status: row.status },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const markReimbursed = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: markReimbursedSchema,
  handler: async (input, ctx) => {
    const before = await loadReport(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Expense report not found')
    assertTransition(before.status as ExpenseReportStatus, 'reimbursed')

    // Fetch one expense to get the currency the approval used (all share currency).
    const [anyExpense] = await ctx.tx
      .select({ currencyCode: expenseEntries.currencyCode })
      .from(expenseEntries)
      .where(
        and(
          eq(expenseEntries.organizationId, ctx.organizationId),
          eq(expenseEntries.expenseReportId, before.id),
          active(expenseEntries),
        ),
      )
      .limit(1)

    if (!anyExpense) {
      throw new Error('No expenses on this report to reimburse.')
    }

    const reimbursedDate = input.reimbursedOn ?? new Date().toISOString().slice(0, 10)
    const journal = await postExpenseReportReimbursementJournal(ctx.tx, {
      organizationId: ctx.organizationId,
      reportId: before.id,
      reportNumber: before.reportNumber,
      entryDate: reimbursedDate,
      totalCents: before.totalCents ?? 0,
      currencyCode: anyExpense.currencyCode,
      subjectPartyId: before.subjectPartyId,
      businessLineId: before.businessLineId,
      reportPurpose: before.purpose,
    })

    const [row] = await ctx.tx
      .update(expenseReports)
      .set({
        status: 'reimbursed',
        reimbursedAt: new Date(),
        reimbursedByUserId: ctx.userId,
      })
      .where(
        and(
          eq(expenseReports.id, before.id),
          eq(expenseReports.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to mark report reimbursed')

    await emitFinanceEvent(ctx.tx, 'finance.expenseReport.reimbursed', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: row.subjectPartyId,
      businessLineId: row.businessLineId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Reimbursed ${row.reportNumber} — ${formatMoney(before.totalCents ?? 0)}`,
      metadata: {
        reimbursementJournalEntryNumber: journal.entryNumber,
        notes: input.notes ?? null,
      },
    })

    return {
      result: {
        id: row.id,
        status: row.status,
        reimbursementJournalEntryNumber: journal.entryNumber,
      },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const softDeleteExpenseReport = defineAction({
  permission: { module: 'finance', action: 'delete' },
  audit: { table: SOURCE_TABLE, action: 'soft_delete' },
  schema: softDeleteExpenseReportSchema,
  handler: async (input, ctx) => {
    const before = await loadReport(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Expense report not found')
    if (!canSoftDelete(before.status as ExpenseReportStatus)) {
      throw new Error(
        `Cannot delete a ${before.status} report. Reject it first.`,
      )
    }

    // Reverse any unreversed journals attached to this report (handles
    // reimbursed → both approval + reimbursement entries, approved → only
    // the approval entry, draft/rejected → no journals to reverse).
    const unreversed = await findUnreversedJournalEntries(
      ctx.tx,
      ctx.organizationId,
      SOURCE_TABLE,
      before.id,
    )
    for (const entry of unreversed) {
      await reverseJournalEntry(ctx.tx, {
        originalEntryId: entry.id,
        organizationId: ctx.organizationId,
        reason: `Report ${before.reportNumber} deleted`,
      })
    }

    // Detach expenses so they become eligible for a new report.
    await ctx.tx
      .update(expenseEntries)
      .set({ expenseReportId: null })
      .where(
        and(
          eq(expenseEntries.organizationId, ctx.organizationId),
          eq(expenseEntries.expenseReportId, before.id),
        ),
      )

    const [row] = await ctx.tx
      .update(expenseReports)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(expenseReports.id, before.id),
          eq(expenseReports.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to soft-delete expense report')

    await emitFinanceEvent(ctx.tx, 'finance.expenseReport.deleted', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: row.subjectPartyId,
      businessLineId: row.businessLineId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Deleted ${row.reportNumber} (${before.status})`,
      metadata: {
        priorStatus: before.status,
        reversedJournalEntries: unreversed.length,
      },
    })

    return {
      result: { id: row.id, reversedJournalEntries: unreversed.length },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

// ---------- private helpers ----------

async function resolveSubjectPartyId(
  tx: FinanceTx,
  userId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ partyId: users.partyId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row?.partyId ?? null
}
