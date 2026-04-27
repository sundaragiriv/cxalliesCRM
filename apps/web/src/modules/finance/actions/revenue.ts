'use server'

import { and, eq } from 'drizzle-orm'
import { revenueEntries } from '../schema'
import { defineAction } from '@/lib/actions/define-action'
import { active } from '@/lib/db/active'
import { emitFinanceEvent } from '../lib/event-emitter'
import { formatMoney } from '../lib/format-money'
import { postRevenueJournal } from '../lib/journal/post-revenue'
import { reverseJournalEntry } from '../lib/journal/reverse-entry'
import {
  createRevenueSchema,
  updateRevenueSchema,
  softDeleteRevenueSchema,
  MATERIAL_FIELDS,
} from './revenue-schema'

export const createRevenue = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: 'finance_revenue_entries', action: 'insert' },
  schema: createRevenueSchema,
  handler: async (input, ctx) => {
    // 1. Insert revenue row (without journal_entry_id; we set it after posting).
    const [row] = await ctx.tx
      .insert(revenueEntries)
      .values({
        organizationId: ctx.organizationId,
        entryDate: input.entryDate,
        businessLineId: input.businessLineId,
        partyId: input.partyId ?? null,
        chartOfAccountsId: input.chartOfAccountsId,
        description: input.description,
        amountCents: input.amountCents,
        currencyCode: input.currencyCode,
        paymentMethod: input.paymentMethod ?? null,
        paymentStatus: input.paymentStatus,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : null,
        notes: input.notes ?? null,
      })
      .returning()

    if (!row) throw new Error('Failed to insert revenue')

    // 2. Post the balanced journal entry (DEBIT cash/AR, CREDIT revenue account).
    const journal = await postRevenueJournal(ctx.tx, {
      organizationId: ctx.organizationId,
      revenueId: row.id,
      entryDate: input.entryDate,
      businessLineId: input.businessLineId,
      partyId: input.partyId ?? null,
      revenueChartOfAccountsId: input.chartOfAccountsId,
      amountCents: input.amountCents,
      currencyCode: input.currencyCode,
      description: input.description,
      paymentStatus: input.paymentStatus,
    })

    // 3. Backfill the journal_entry_id on the revenue row.
    await ctx.tx
      .update(revenueEntries)
      .set({ journalEntryId: journal.id })
      .where(eq(revenueEntries.id, row.id))

    // 4. Emit activity event.
    await emitFinanceEvent(ctx.tx, 'finance.revenue.created', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: input.partyId ?? null,
      businessLineId: input.businessLineId,
      entityTable: 'finance_revenue_entries',
      entityId: row.id,
      summary: `Recorded revenue ${formatMoney(input.amountCents)} — ${input.description}`,
      metadata: {
        amountCents: input.amountCents,
        chartOfAccountsId: input.chartOfAccountsId,
        paymentStatus: input.paymentStatus,
        journalEntryNumber: journal.entryNumber,
      },
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      after: { ...row, journalEntryId: journal.id },
    }
  },
})

export const updateRevenue = defineAction({
  permission: { module: 'finance', action: 'write' },
  audit: { table: 'finance_revenue_entries', action: 'update' },
  schema: updateRevenueSchema,
  handler: async (input, ctx) => {
    // Load the existing row so we can compare for material changes.
    const [before] = await ctx.tx
      .select()
      .from(revenueEntries)
      .where(
        and(
          eq(revenueEntries.id, input.id),
          eq(revenueEntries.organizationId, ctx.organizationId),
          active(revenueEntries),
        ),
      )
      .limit(1)

    if (!before) throw new Error('Revenue not found')

    // Material change (amount, account, business_line, payment_status, currency)
    // triggers reverse+repost so the journal book reflects the correction.
    // Cosmetic change (description, notes, party, dates only) is a simple UPDATE.
    const isMaterial = MATERIAL_FIELDS.some((field) => {
      const beforeValue = before[field as keyof typeof before]
      const inputValue = input[field as keyof typeof input]
      return beforeValue !== inputValue
    })

    let newJournalEntryId: string | null = before.journalEntryId
    let journalEntryNumber: string | null = null

    if (isMaterial && before.journalEntryId) {
      // 1. Reverse the original journal entry.
      await reverseJournalEntry(ctx.tx, {
        originalEntryId: before.journalEntryId,
        organizationId: ctx.organizationId,
        reason: `Revenue ${input.id} updated`,
      })

      // 2. Post a new journal entry with the new values.
      const fresh = await postRevenueJournal(ctx.tx, {
        organizationId: ctx.organizationId,
        revenueId: input.id,
        entryDate: input.entryDate,
        businessLineId: input.businessLineId,
        partyId: input.partyId ?? null,
        revenueChartOfAccountsId: input.chartOfAccountsId,
        amountCents: input.amountCents,
        currencyCode: input.currencyCode,
        description: input.description,
        paymentStatus: input.paymentStatus,
      })
      newJournalEntryId = fresh.id
      journalEntryNumber = fresh.entryNumber
    }

    // 3. Update the revenue row (always — even cosmetic edits update fields).
    const [row] = await ctx.tx
      .update(revenueEntries)
      .set({
        entryDate: input.entryDate,
        businessLineId: input.businessLineId,
        partyId: input.partyId ?? null,
        chartOfAccountsId: input.chartOfAccountsId,
        description: input.description,
        amountCents: input.amountCents,
        currencyCode: input.currencyCode,
        paymentMethod: input.paymentMethod ?? null,
        paymentStatus: input.paymentStatus,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : null,
        notes: input.notes ?? null,
        journalEntryId: newJournalEntryId,
      })
      .where(
        and(
          eq(revenueEntries.id, input.id),
          eq(revenueEntries.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to update revenue')

    await emitFinanceEvent(ctx.tx, 'finance.revenue.updated', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: input.partyId ?? null,
      businessLineId: input.businessLineId,
      entityTable: 'finance_revenue_entries',
      entityId: row.id,
      summary: `Updated revenue ${formatMoney(input.amountCents)} — ${input.description}${isMaterial ? ' (correction posted to journal)' : ''}`,
      metadata: { isMaterial, journalEntryNumber },
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const softDeleteRevenue = defineAction({
  permission: { module: 'finance', action: 'delete' },
  audit: { table: 'finance_revenue_entries', action: 'soft_delete' },
  schema: softDeleteRevenueSchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(revenueEntries)
      .where(
        and(
          eq(revenueEntries.id, input.id),
          eq(revenueEntries.organizationId, ctx.organizationId),
          active(revenueEntries),
        ),
      )
      .limit(1)

    if (!before) throw new Error('Revenue not found')

    // 1. Reverse the journal entry (preserves both for audit; net effect zero).
    if (before.journalEntryId) {
      await reverseJournalEntry(ctx.tx, {
        originalEntryId: before.journalEntryId,
        organizationId: ctx.organizationId,
        reason: `Revenue ${input.id} deleted`,
      })
    }

    // 2. Soft-delete the revenue row.
    const [row] = await ctx.tx
      .update(revenueEntries)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(revenueEntries.id, input.id),
          eq(revenueEntries.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to soft-delete revenue')

    await emitFinanceEvent(ctx.tx, 'finance.revenue.deleted', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      partyId: before.partyId,
      businessLineId: before.businessLineId,
      entityTable: 'finance_revenue_entries',
      entityId: row.id,
      summary: `Deleted revenue ${formatMoney(before.amountCents)} — ${before.description}`,
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})
