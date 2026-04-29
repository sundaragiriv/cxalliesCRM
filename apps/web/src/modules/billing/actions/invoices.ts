'use server'

import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import {
  invoices,
  invoiceLines,
  payments,
  paymentApplications,
  projects,
  timeEntries,
} from '../schema'
import { expenseEntries } from '@/modules/finance/schema'
import { defineAction } from '@/lib/actions/define-action'
import { active } from '@/lib/db/active'
import { emitBillingEvent } from '../lib/event-emitter'
import { nextInvoiceNumber } from '../lib/invoices/next-invoice-number'
import { nextPaymentNumber } from '../lib/payments/next-payment-number'
import {
  assertTransition,
  canEditContent,
  canSoftDelete,
  type InvoiceStatus,
} from '../lib/invoices/state-machine'
import {
  generateInvoiceLines,
  type SourceExpenseEntry,
  type SourceTimeEntry,
} from '../lib/invoices/generator'
import { findUnreversedJournalEntries } from '@/modules/finance/lib/journal/find-unreversed'
import { postInvoiceJournal } from '@/modules/finance/lib/journal/post-invoice'
import { postPaymentJournal } from '@/modules/finance/lib/journal/post-payment'
import { reverseJournalEntry } from '@/modules/finance/lib/journal/reverse-entry'
import { recomputeTaxEstimateForDateChange } from '@/modules/finance/lib/tax/recompute'
import {
  createInvoiceSchema,
  generateInvoiceFromProjectSchema,
  markInvoicePaidSchema,
  sendInvoiceSchema,
  softDeleteInvoiceSchema,
  updateInvoiceSchema,
  voidInvoiceSchema,
} from './invoices-schema'
import type { FinanceTx } from '@/lib/audit/with-audit'

const SOURCE_TABLE = 'billing_invoices'

async function loadInvoice(
  tx: FinanceTx,
  organizationId: string,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, id),
        eq(invoices.organizationId, organizationId),
        active(invoices),
      ),
    )
    .limit(1)
  return row
}

export const generateInvoiceFromProject = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'insert' },
  schema: generateInvoiceFromProjectSchema,
  handler: async (input, ctx) => {
    if (input.periodEnd < input.periodStart) {
      throw new Error('periodEnd must be on or after periodStart')
    }
    if (input.dueDate < input.issueDate) {
      throw new Error('dueDate must be on or after issueDate')
    }

    // Load the project for BL + currency + bill-to fallback.
    const [project] = await ctx.tx
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.organizationId, ctx.organizationId),
          active(projects),
        ),
      )
      .limit(1)
    if (!project) throw new Error('Project not found')

    const billToPartyId = input.billToPartyId ?? project.endClientPartyId
    if (!billToPartyId) {
      throw new Error(
        'Project has no end_client_party_id and no bill-to override provided',
      )
    }

    // Pull approved time entries for project + period.
    const sourceTimes = await ctx.tx
      .select({
        id: timeEntries.id,
        entryDate: timeEntries.entryDate,
        description: timeEntries.description,
        hours: timeEntries.hours,
        billableRateCents: timeEntries.billableRateCents,
        currencyCode: timeEntries.currencyCode,
        projectId: timeEntries.projectId,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.organizationId, ctx.organizationId),
          eq(timeEntries.projectId, input.projectId),
          eq(timeEntries.status, 'approved'),
          gte(timeEntries.entryDate, input.periodStart),
          lte(timeEntries.entryDate, input.periodEnd),
          active(timeEntries),
          isNull(timeEntries.invoiceLineId),
        ),
      )

    // Pull active billable expenses for project + period not yet invoiced.
    const sourceExpenses = await ctx.tx
      .select({
        id: expenseEntries.id,
        entryDate: expenseEntries.entryDate,
        description: expenseEntries.description,
        amountCents: expenseEntries.amountCents,
        currencyCode: expenseEntries.currencyCode,
        projectId: expenseEntries.projectId,
        chartOfAccountsId: expenseEntries.chartOfAccountsId,
      })
      .from(expenseEntries)
      .where(
        and(
          eq(expenseEntries.organizationId, ctx.organizationId),
          eq(expenseEntries.projectId, input.projectId),
          eq(expenseEntries.isBillable, true),
          gte(expenseEntries.entryDate, input.periodStart),
          lte(expenseEntries.entryDate, input.periodEnd),
          active(expenseEntries),
          isNull(expenseEntries.invoiceId),
        ),
      )

    if (sourceTimes.length === 0 && sourceExpenses.length === 0) {
      throw new Error(
        `No approved time entries or billable expenses found for project ${project.projectNumber} between ${input.periodStart} and ${input.periodEnd}.`,
      )
    }

    // Pure generator — §3.13 snapshots happen here.
    const draft = generateInvoiceLines({
      timeEntries: sourceTimes.map<SourceTimeEntry>((t) => ({
        id: t.id,
        entryDate: t.entryDate,
        description: t.description,
        hoursText: t.hours,
        billableRateCents: t.billableRateCents,
        currencyCode: t.currencyCode,
        projectId: t.projectId,
      })),
      expenses: sourceExpenses.map<SourceExpenseEntry>((e) => ({
        id: e.id,
        entryDate: e.entryDate,
        description: e.description,
        amountCents: e.amountCents,
        currencyCode: e.currencyCode,
        projectId: e.projectId,
        chartOfAccountsId: e.chartOfAccountsId,
      })),
    })

    // Validate currency parity with project.
    if (draft.currencyCode !== project.currencyCode) {
      throw new Error(
        `Source entries currency (${draft.currencyCode}) doesn't match project currency (${project.currencyCode}).`,
      )
    }

    const year = Number(input.issueDate.slice(0, 4))
    const invoiceNumber = await nextInvoiceNumber(
      ctx.tx,
      ctx.organizationId,
      year,
    )

    const [invoiceRow] = await ctx.tx
      .insert(invoices)
      .values({
        organizationId: ctx.organizationId,
        invoiceNumber,
        billToPartyId,
        businessLineId: project.businessLineId,
        projectId: project.id,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        currencyCode: draft.currencyCode,
        subtotalCents: draft.subtotalCents,
        taxCents: 0, // Phase 1 pre-tax; Phase 4 lands tax handling
        totalCents: draft.subtotalCents,
        paidCents: 0,
        status: 'draft',
        terms: input.terms ?? null,
        notes: input.notes ?? null,
      })
      .returning()
    if (!invoiceRow) throw new Error('Failed to insert invoice')

    // Insert lines.
    const insertedLines = await ctx.tx
      .insert(invoiceLines)
      .values(
        draft.lines.map((l) => ({
          organizationId: ctx.organizationId,
          invoiceId: invoiceRow.id,
          lineNumber: l.lineNumber,
          description: l.description,
          kind: l.kind,
          projectId: l.projectId,
          quantity: l.quantityText,
          unitPriceCents: l.unitPriceCents,
          amountCents: l.amountCents,
          currencyCode: l.currencyCode,
          chartOfAccountsId: l.chartOfAccountsId,
        })),
      )
      .returning({ id: invoiceLines.id, lineNumber: invoiceLines.lineNumber })

    // Update source linkbacks.
    for (const draftLine of draft.lines) {
      const insertedLine = insertedLines.find(
        (l) => l.lineNumber === draftLine.lineNumber,
      )
      if (!insertedLine) throw new Error('Line linkback mismatch')
      if (draftLine.sourceTimeEntryId) {
        await ctx.tx
          .update(timeEntries)
          .set({ status: 'invoiced', invoiceLineId: insertedLine.id })
          .where(eq(timeEntries.id, draftLine.sourceTimeEntryId))
      } else if (draftLine.sourceExpenseEntryId) {
        await ctx.tx
          .update(expenseEntries)
          .set({ invoiceId: invoiceRow.id })
          .where(eq(expenseEntries.id, draftLine.sourceExpenseEntryId))
      }
    }

    await emitBillingEvent(ctx.tx, 'billing.invoice.created', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      businessLineId: project.businessLineId,
      partyId: billToPartyId,
      entityTable: SOURCE_TABLE,
      entityId: invoiceRow.id,
      summary: `Created invoice ${invoiceNumber} for project ${project.projectNumber} — ${(draft.subtotalCents / 100).toFixed(2)} ${draft.currencyCode}`,
      metadata: {
        invoiceNumber,
        timeEntryCount: sourceTimes.length,
        expenseCount: sourceExpenses.length,
        subtotalCents: draft.subtotalCents,
      },
    })

    return {
      result: {
        id: invoiceRow.id,
        invoiceNumber,
        subtotalCents: draft.subtotalCents,
      },
      recordId: invoiceRow.id,
      after: invoiceRow,
    }
  },
})

export const createInvoice = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'insert' },
  schema: createInvoiceSchema,
  handler: async (input, ctx) => {
    if (input.dueDate < input.issueDate) {
      throw new Error('dueDate must be on or after issueDate')
    }

    const year = Number(input.issueDate.slice(0, 4))
    const invoiceNumber = await nextInvoiceNumber(
      ctx.tx,
      ctx.organizationId,
      year,
    )

    let subtotal = 0
    const lineRows = input.lines.map((l, idx) => {
      const qtyHundredths = Math.round(parseFloat(l.quantityText) * 100)
      const amount = Math.round((qtyHundredths * l.unitPriceCents) / 100)
      subtotal += amount
      return {
        lineNumber: idx + 1,
        description: l.description,
        kind: l.kind,
        projectId: input.projectId ?? null,
        quantity: l.quantityText,
        unitPriceCents: l.unitPriceCents,
        amountCents: amount,
        currencyCode: input.currencyCode,
        chartOfAccountsId: l.chartOfAccountsId,
      }
    })

    if (subtotal <= 0) {
      throw new Error('Invoice subtotal must be > 0')
    }

    const [invoiceRow] = await ctx.tx
      .insert(invoices)
      .values({
        organizationId: ctx.organizationId,
        invoiceNumber,
        billToPartyId: input.billToPartyId,
        businessLineId: input.businessLineId,
        projectId: input.projectId ?? null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        currencyCode: input.currencyCode,
        subtotalCents: subtotal,
        taxCents: 0,
        totalCents: subtotal,
        paidCents: 0,
        status: 'draft',
        terms: input.terms ?? null,
        notes: input.notes ?? null,
      })
      .returning()
    if (!invoiceRow) throw new Error('Failed to insert invoice')

    await ctx.tx.insert(invoiceLines).values(
      lineRows.map((r) => ({
        organizationId: ctx.organizationId,
        invoiceId: invoiceRow.id,
        ...r,
      })),
    )

    await emitBillingEvent(ctx.tx, 'billing.invoice.created', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      businessLineId: input.businessLineId,
      partyId: input.billToPartyId,
      entityTable: SOURCE_TABLE,
      entityId: invoiceRow.id,
      summary: `Created invoice ${invoiceNumber} (manual)`,
      metadata: { invoiceNumber, lineCount: input.lines.length },
    })

    return {
      result: { id: invoiceRow.id, invoiceNumber },
      recordId: invoiceRow.id,
      after: invoiceRow,
    }
  },
})

export const updateInvoice = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: updateInvoiceSchema,
  handler: async (input, ctx) => {
    const before = await loadInvoice(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Invoice not found')
    if (!canEditContent(before.status as InvoiceStatus)) {
      throw new Error(
        `Cannot edit invoice while status is '${before.status}'. Void and create a new invoice instead.`,
      )
    }

    const [row] = await ctx.tx
      .update(invoices)
      .set({
        terms: input.terms ?? null,
        notes: input.notes ?? null,
      })
      .where(
        and(
          eq(invoices.id, input.id),
          eq(invoices.organizationId, ctx.organizationId),
        ),
      )
      .returning()
    if (!row) throw new Error('Failed to update invoice')

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const sendInvoice = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: sendInvoiceSchema,
  handler: async (input, ctx) => {
    const before = await loadInvoice(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Invoice not found')
    assertTransition(before.status as InvoiceStatus, 'sent')
    if (before.totalCents <= 0) {
      throw new Error('Cannot send an invoice with $0 total')
    }

    // Load lines for journal posting.
    const lines = await ctx.tx
      .select({
        id: invoiceLines.id,
        amountCents: invoiceLines.amountCents,
        chartOfAccountsId: invoiceLines.chartOfAccountsId,
        description: invoiceLines.description,
        projectId: invoiceLines.projectId,
      })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, before.id))

    if (lines.length === 0) {
      throw new Error('Cannot send an invoice with no lines')
    }

    // For lines without explicit chart_of_accounts_id, look up the project's BL.
    const projectIds = Array.from(
      new Set(
        lines.map((l) => l.projectId).filter((id): id is string => id != null),
      ),
    )
    const projectBLs = projectIds.length
      ? await ctx.tx
          .select({ id: projects.id, businessLineId: projects.businessLineId })
          .from(projects)
          .where(
            and(
              eq(projects.organizationId, ctx.organizationId),
              sql`${projects.id} = ANY(${projectIds}::uuid[])`,
            ),
          )
      : []
    const blByProject = new Map(projectBLs.map((p) => [p.id, p.businessLineId]))

    const today = input.id // unused; placeholder
    void today
    const sentDate = new Date().toISOString().slice(0, 10)

    const journal = await postInvoiceJournal(ctx.tx, {
      organizationId: ctx.organizationId,
      invoiceId: before.id,
      invoiceNumber: before.invoiceNumber,
      entryDate: sentDate,
      totalCents: before.totalCents,
      currencyCode: before.currencyCode,
      billToPartyId: before.billToPartyId,
      invoiceBusinessLineId: before.businessLineId,
      lines: lines.map((l) => ({
        id: l.id,
        amountCents: l.amountCents,
        chartOfAccountsId: l.chartOfAccountsId,
        projectBusinessLineId: l.projectId
          ? (blByProject.get(l.projectId) ?? null)
          : null,
        description: l.description,
      })),
    })

    const [row] = await ctx.tx
      .update(invoices)
      .set({ status: 'sent', sentAt: new Date() })
      .where(
        and(
          eq(invoices.id, before.id),
          eq(invoices.organizationId, ctx.organizationId),
        ),
      )
      .returning()
    if (!row) throw new Error('Failed to mark invoice sent')

    await emitBillingEvent(ctx.tx, 'billing.invoice.sent', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      businessLineId: row.businessLineId,
      partyId: row.billToPartyId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Marked invoice ${row.invoiceNumber} as sent — ${(row.totalCents / 100).toFixed(2)} ${row.currencyCode}`,
      metadata: {
        invoiceJournalEntryNumber: journal.entryNumber,
        totalCents: row.totalCents,
      },
    })

    return {
      result: { id: row.id, journalEntryNumber: journal.entryNumber },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const markInvoicePaid = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: 'billing_payments', action: 'insert' },
  schema: markInvoicePaidSchema,
  handler: async (input, ctx) => {
    const before = await loadInvoice(ctx.tx, ctx.organizationId, input.invoiceId)
    if (!before) throw new Error('Invoice not found')
    if (before.status !== 'sent' && before.status !== 'partially_paid') {
      throw new Error(
        `Cannot record payment on invoice with status '${before.status}'. Send the invoice first.`,
      )
    }

    const year = Number(input.paymentDate.slice(0, 4))
    const paymentNumber = await nextPaymentNumber(
      ctx.tx,
      ctx.organizationId,
      year,
    )

    // Insert payment row.
    const [payment] = await ctx.tx
      .insert(payments)
      .values({
        organizationId: ctx.organizationId,
        paymentNumber,
        fromPartyId: before.billToPartyId,
        paymentDate: input.paymentDate,
        amountCents: input.amountCents,
        currencyCode: before.currencyCode,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      })
      .returning()
    if (!payment) throw new Error('Failed to insert payment')

    // Insert payment_application linking this payment to the invoice.
    await ctx.tx.insert(paymentApplications).values({
      organizationId: ctx.organizationId,
      paymentId: payment.id,
      invoiceId: before.id,
      appliedCents: input.amountCents,
      currencyCode: before.currencyCode,
    })

    // Post the 2-line payment journal.
    const journal = await postPaymentJournal(ctx.tx, {
      organizationId: ctx.organizationId,
      paymentId: payment.id,
      paymentNumber,
      entryDate: input.paymentDate,
      amountCents: input.amountCents,
      currencyCode: before.currencyCode,
      fromPartyId: before.billToPartyId,
      businessLineId: before.businessLineId,
      appliedToInvoiceNumbers: [before.invoiceNumber],
    })

    // Update invoice's denormalized paid_cents and status.
    const newPaidCents = (before.paidCents ?? 0) + input.amountCents
    const newStatus: InvoiceStatus =
      newPaidCents >= before.totalCents ? 'paid' : 'partially_paid'

    const [invoiceRow] = await ctx.tx
      .update(invoices)
      .set({
        paidCents: newPaidCents,
        status: newStatus,
        paidAt: newStatus === 'paid' ? new Date() : null,
      })
      .where(
        and(
          eq(invoices.id, before.id),
          eq(invoices.organizationId, ctx.organizationId),
        ),
      )
      .returning()
    if (!invoiceRow) throw new Error('Failed to update invoice paid_cents')

    // Tax-estimate recompute — cash basis recognizes income at payment date.
    await recomputeTaxEstimateForDateChange(
      ctx.tx,
      ctx.organizationId,
      null,
      input.paymentDate,
    )

    await emitBillingEvent(
      ctx.tx,
      newStatus === 'paid' ? 'billing.invoice.paid' : 'billing.invoice.partiallyPaid',
      {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        businessLineId: invoiceRow.businessLineId,
        partyId: invoiceRow.billToPartyId,
        entityTable: SOURCE_TABLE,
        entityId: invoiceRow.id,
        summary: `${newStatus === 'paid' ? 'Paid' : 'Partial pay'} ${invoiceRow.invoiceNumber} — ${(input.amountCents / 100).toFixed(2)} ${invoiceRow.currencyCode} (${paymentNumber})`,
        metadata: {
          paymentNumber,
          amountCents: input.amountCents,
          paidCents: newPaidCents,
          totalCents: invoiceRow.totalCents,
          paymentJournalEntryNumber: journal.entryNumber,
        },
      },
    )

    await emitBillingEvent(ctx.tx, 'billing.payment.created', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      businessLineId: invoiceRow.businessLineId,
      partyId: payment.fromPartyId,
      entityTable: 'billing_payments',
      entityId: payment.id,
      summary: `Recorded payment ${paymentNumber} — ${(input.amountCents / 100).toFixed(2)} ${invoiceRow.currencyCode} (${input.paymentMethod})`,
      metadata: {
        paymentNumber,
        invoiceNumber: invoiceRow.invoiceNumber,
        journalEntryNumber: journal.entryNumber,
      },
    })

    return {
      result: {
        invoiceId: invoiceRow.id,
        paymentId: payment.id,
        paymentNumber,
        invoiceStatus: invoiceRow.status,
        paymentJournalEntryNumber: journal.entryNumber,
      },
      recordId: payment.id,
      after: payment as Record<string, unknown>,
    }
  },
})

export const voidInvoice = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: voidInvoiceSchema,
  handler: async (input, ctx) => {
    const before = await loadInvoice(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Invoice not found')
    assertTransition(before.status as InvoiceStatus, 'void')

    // BLOCK if any payments recorded — refund flow is Phase 2+.
    if ((before.paidCents ?? 0) > 0) {
      throw new Error(
        `Cannot void invoice ${before.invoiceNumber} with ${(before.paidCents! / 100).toFixed(2)} ${before.currencyCode} in recorded payments. Issue a credit memo or process a refund (Phase 2 features); or contact support to manually reverse.`,
      )
    }

    // Reverse the invoice's posted journal entries.
    const unreversed = await findUnreversedJournalEntries(
      ctx.tx,
      ctx.organizationId,
      'billing_invoices',
      before.id,
    )
    for (const entry of unreversed) {
      await reverseJournalEntry(ctx.tx, {
        originalEntryId: entry.id,
        organizationId: ctx.organizationId,
        reason: `Invoice ${before.invoiceNumber} voided: ${input.reason}`,
      })
    }

    const [row] = await ctx.tx
      .update(invoices)
      .set({ status: 'void', voidedAt: new Date() })
      .where(
        and(
          eq(invoices.id, before.id),
          eq(invoices.organizationId, ctx.organizationId),
        ),
      )
      .returning()
    if (!row) throw new Error('Failed to void invoice')

    // Release source linkbacks so the source rows can be re-invoiced.
    await ctx.tx
      .update(timeEntries)
      .set({ status: 'approved', invoiceLineId: null })
      .where(
        and(
          eq(timeEntries.organizationId, ctx.organizationId),
          eq(timeEntries.status, 'invoiced'),
          sql`${timeEntries.invoiceLineId} IN (
            SELECT id FROM billing_invoice_lines WHERE invoice_id = ${before.id}
          )`,
        ),
      )
    await ctx.tx
      .update(expenseEntries)
      .set({ invoiceId: null })
      .where(
        and(
          eq(expenseEntries.organizationId, ctx.organizationId),
          eq(expenseEntries.invoiceId, before.id),
        ),
      )

    // Recompute tax estimate — voiding a sent invoice doesn't change cash-basis
    // income (no payment was received). Defensive call for forward-compat with
    // accrual mode.
    await recomputeTaxEstimateForDateChange(
      ctx.tx,
      ctx.organizationId,
      before.issueDate,
      null,
    )

    await emitBillingEvent(ctx.tx, 'billing.invoice.voided', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      businessLineId: row.businessLineId,
      partyId: row.billToPartyId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Voided invoice ${row.invoiceNumber} — ${input.reason}`,
      metadata: {
        reason: input.reason,
        reversedJournalEntries: unreversed.length,
      },
    })

    return {
      result: {
        id: row.id,
        reversedJournalEntries: unreversed.length,
      },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const softDeleteInvoice = defineAction({
  permission: { module: 'billing', action: 'delete' },
  audit: { table: SOURCE_TABLE, action: 'soft_delete' },
  schema: softDeleteInvoiceSchema,
  handler: async (input, ctx) => {
    const before = await loadInvoice(ctx.tx, ctx.organizationId, input.id)
    if (!before) throw new Error('Invoice not found')
    if (!canSoftDelete(before.status as InvoiceStatus)) {
      throw new Error(
        `Cannot soft-delete invoice with status '${before.status}'. Use void instead.`,
      )
    }

    // For draft, no journal exists. For void, journals were already reversed
    // by voidInvoice. So no reverse-journals here.
    const [row] = await ctx.tx
      .update(invoices)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(invoices.id, before.id),
          eq(invoices.organizationId, ctx.organizationId),
        ),
      )
      .returning()
    if (!row) throw new Error('Failed to soft-delete invoice')

    // For draft state, also release any source linkbacks (defensive — drafts
    // from the manual flow don't link sources, but generated drafts do).
    if (before.status === 'draft') {
      await ctx.tx
        .update(timeEntries)
        .set({ status: 'approved', invoiceLineId: null })
        .where(
          and(
            eq(timeEntries.organizationId, ctx.organizationId),
            sql`${timeEntries.invoiceLineId} IN (
              SELECT id FROM billing_invoice_lines WHERE invoice_id = ${before.id}
            )`,
          ),
        )
      await ctx.tx
        .update(expenseEntries)
        .set({ invoiceId: null })
        .where(
          and(
            eq(expenseEntries.organizationId, ctx.organizationId),
            eq(expenseEntries.invoiceId, before.id),
          ),
        )
    }

    await recomputeTaxEstimateForDateChange(
      ctx.tx,
      ctx.organizationId,
      before.issueDate,
      null,
    )

    await emitBillingEvent(ctx.tx, 'billing.invoice.deleted', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      businessLineId: row.businessLineId,
      partyId: row.billToPartyId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Deleted invoice ${row.invoiceNumber} (${before.status})`,
      metadata: { priorStatus: before.status },
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})
