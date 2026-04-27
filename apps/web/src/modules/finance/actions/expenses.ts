'use server'

import { and, eq } from 'drizzle-orm'
import { expenseEntries } from '../schema'
import { defineAction } from '@/lib/actions/define-action'
import { active } from '@/lib/db/active'
import { emitFinanceEvent } from '../lib/event-emitter'
import { formatMoney } from '../lib/format-money'
import {
  createExpenseSchema,
  updateExpenseSchema,
  softDeleteExpenseSchema,
} from './expenses-schema'

export const createExpense = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: 'finance_expense_entries', action: 'insert' },
  schema: createExpenseSchema,
  handler: async (input, ctx) => {
    const [row] = await ctx.tx
      .insert(expenseEntries)
      .values({
        organizationId: ctx.organizationId,
        entryDate: input.entryDate,
        businessLineId: input.businessLineId,
        chartOfAccountsId: input.chartOfAccountsId,
        payeePartyId: input.payeePartyId ?? null,
        description: input.description,
        amountCents: input.amountCents,
        currencyCode: input.currencyCode,
        paymentSource: input.paymentSource,
        corporateCardId: input.corporateCardId ?? null,
        isBillable: input.isBillable,
        isReimbursable: input.isReimbursable,
        projectId: input.projectId ?? null,
        receiptFileId: input.receiptFileId ?? null,
        notes: input.notes ?? null,
        submittedByUserId: ctx.userId,
      })
      .returning()

    if (!row) throw new Error('Failed to insert expense')

    await emitFinanceEvent(ctx.tx, 'finance.expense.created', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: input.payeePartyId ?? null,
      businessLineId: input.businessLineId,
      entityTable: 'finance_expense_entries',
      entityId: row.id,
      summary: `Recorded expense ${formatMoney(input.amountCents)} — ${input.description}`,
      metadata: {
        amountCents: input.amountCents,
        chartOfAccountsId: input.chartOfAccountsId,
        isBillable: input.isBillable,
        isReimbursable: input.isReimbursable,
      },
    })

    return { result: { id: row.id }, recordId: row.id, after: row }
  },
})

export const updateExpense = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: 'finance_expense_entries', action: 'update' },
  schema: updateExpenseSchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(expenseEntries)
      .where(
        and(
          eq(expenseEntries.id, input.id),
          eq(expenseEntries.organizationId, ctx.organizationId),
          active(expenseEntries),
        ),
      )
      .limit(1)

    if (!before) throw new Error('Expense not found')

    const [row] = await ctx.tx
      .update(expenseEntries)
      .set({
        entryDate: input.entryDate,
        businessLineId: input.businessLineId,
        chartOfAccountsId: input.chartOfAccountsId,
        payeePartyId: input.payeePartyId ?? null,
        description: input.description,
        amountCents: input.amountCents,
        currencyCode: input.currencyCode,
        paymentSource: input.paymentSource,
        corporateCardId: input.corporateCardId ?? null,
        isBillable: input.isBillable,
        isReimbursable: input.isReimbursable,
        projectId: input.projectId ?? null,
        receiptFileId: input.receiptFileId ?? null,
        notes: input.notes ?? null,
      })
      .where(
        and(
          eq(expenseEntries.id, input.id),
          eq(expenseEntries.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to update expense')

    await emitFinanceEvent(ctx.tx, 'finance.expense.updated', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: input.payeePartyId ?? null,
      businessLineId: input.businessLineId,
      entityTable: 'finance_expense_entries',
      entityId: row.id,
      summary: `Updated expense ${formatMoney(input.amountCents)} — ${input.description}`,
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const softDeleteExpense = defineAction({
  permission: { module: 'finance', action: 'delete' },
  audit: { table: 'finance_expense_entries', action: 'soft_delete' },
  schema: softDeleteExpenseSchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(expenseEntries)
      .where(
        and(
          eq(expenseEntries.id, input.id),
          eq(expenseEntries.organizationId, ctx.organizationId),
          active(expenseEntries),
        ),
      )
      .limit(1)

    if (!before) throw new Error('Expense not found')

    const [row] = await ctx.tx
      .update(expenseEntries)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(expenseEntries.id, input.id),
          eq(expenseEntries.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to soft-delete expense')

    await emitFinanceEvent(ctx.tx, 'finance.expense.deleted', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: before.payeePartyId,
      businessLineId: before.businessLineId,
      entityTable: 'finance_expense_entries',
      entityId: row.id,
      summary: `Deleted expense ${formatMoney(before.amountCents)} — ${before.description}`,
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})
