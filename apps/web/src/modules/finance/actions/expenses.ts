'use server'

import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/db/client'
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

async function getOrgIdAndUser(): Promise<{ orgId: string; userId: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Not signed in')
  const orgId = (session.user as { organizationId?: string }).organizationId
  if (!orgId) throw new Error('Missing organization context')
  return { orgId, userId: session.user.id }
}

export const createExpense = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: 'finance_expense_entries', action: 'insert' },
  schema: createExpenseSchema,
  handler: async (input) => {
    const { orgId, userId } = await getOrgIdAndUser()

    const [row] = await db
      .insert(expenseEntries)
      .values({
        organizationId: orgId,
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
        submittedByUserId: userId,
      })
      .returning()

    if (!row) throw new Error('Failed to insert expense')

    await emitFinanceEvent('finance.expense.created', {
      organizationId: orgId,
      actorUserId: userId,
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
  handler: async (input) => {
    const { orgId, userId } = await getOrgIdAndUser()

    const [before] = await db
      .select()
      .from(expenseEntries)
      .where(and(eq(expenseEntries.id, input.id), eq(expenseEntries.organizationId, orgId), active(expenseEntries)))
      .limit(1)

    if (!before) throw new Error('Expense not found')

    const [row] = await db
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
      .where(and(eq(expenseEntries.id, input.id), eq(expenseEntries.organizationId, orgId)))
      .returning()

    if (!row) throw new Error('Failed to update expense')

    await emitFinanceEvent('finance.expense.updated', {
      organizationId: orgId,
      actorUserId: userId,
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
  handler: async (input) => {
    const { orgId, userId } = await getOrgIdAndUser()

    const [before] = await db
      .select()
      .from(expenseEntries)
      .where(and(eq(expenseEntries.id, input.id), eq(expenseEntries.organizationId, orgId), active(expenseEntries)))
      .limit(1)

    if (!before) throw new Error('Expense not found')

    const [row] = await db
      .update(expenseEntries)
      .set({ deletedAt: new Date() })
      .where(and(eq(expenseEntries.id, input.id), eq(expenseEntries.organizationId, orgId)))
      .returning()

    if (!row) throw new Error('Failed to soft-delete expense')

    await emitFinanceEvent('finance.expense.deleted', {
      organizationId: orgId,
      actorUserId: userId,
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
