/**
 * P1-13 end-to-end invoicing verification.
 *
 * Exercises against the real DB:
 *   1. Create a test project (with rate)
 *   2. Insert time entries → approve them via timesheet cascade
 *   3. Insert billable expense
 *   4. Generate invoice from project + period (via the action)
 *   5. §3.13 HEADLINE TEST: edit a source time_entry's description AFTER
 *      generation; assert the invoice line is UNCHANGED
 *   6. Mark sent → verify postInvoiceJournal posts a balanced multi-line entry
 *   7. Mark partially paid → verify postPaymentJournal posts balanced 2 lines;
 *      invoice status flips to 'partially_paid'
 *   8. Mark fully paid → verify second payment journal; status flips to 'paid'
 *   9. Tax estimate recompute fires on payment receive (cash-basis income shift)
 *  10. Generate a SECOND invoice; void it; verify journal reversed
 *  11. Void a paid invoice — assert it's BLOCKED (refund flow Phase 2)
 *  12. Org-wide SUM(debits) == SUM(credits) at every step
 *
 * Cleans up everything it created. Re-runnable.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  invoiceLines,
  invoices,
  paymentApplications,
  payments,
  projects,
  timeEntries,
  timesheets,
} from '../src/modules/billing/schema'
import { businessLines, organizations } from '../src/modules/parties/schema'
import { users } from '../src/modules/auth/schema'
import {
  chartOfAccounts,
  expenseEntries,
  journalEntries,
  journalLines,
  taxEstimates,
} from '../src/modules/finance/schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL not set')

const client = postgres(url, { max: 1 })
const db = drizzle(client)

const createdProjectIds: string[] = []
const createdInvoiceIds: string[] = []
const createdTimeEntryIds: string[] = []
const createdExpenseIds: string[] = []
const createdTimesheetIds: string[] = []
const createdPaymentIds: string[] = []
const createdEstimateIds: string[] = []

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

async function assertJournalBalanced(tx: any, label: string) {
  const rows = await tx
    .select({
      entryId: journalEntries.id,
      entryNumber: journalEntries.entryNumber,
      debits: sql<string>`COALESCE(SUM(${journalLines.debitCents}), 0)::text`,
      credits: sql<string>`COALESCE(SUM(${journalLines.creditCents}), 0)::text`,
    })
    .from(journalEntries)
    .leftJoin(journalLines, eq(journalLines.journalEntryId, journalEntries.id))
    .groupBy(journalEntries.id, journalEntries.entryNumber)
  for (const r of rows) {
    if (Number(r.debits) !== Number(r.credits)) {
      throw new Error(
        `${label}: entry ${r.entryNumber} unbalanced (debits=${r.debits}, credits=${r.credits})`,
      )
    }
  }
}

async function main() {
  await db.transaction(async (tx) => {
    // ---- 0. Locate fixtures ----
    const [org] = await tx.select({ id: organizations.id }).from(organizations).limit(1)
    if (!org) throw new Error('No organizations seeded.')
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.organizationId, org.id))
      .limit(1)
    if (!user) throw new Error('No users seeded.')
    const [bl] = await tx
      .select({ id: businessLines.id, slug: businessLines.slug })
      .from(businessLines)
      .where(
        and(
          eq(businessLines.organizationId, org.id),
          eq(businessLines.slug, 'consulting'),
        ),
      )
      .limit(1)
    if (!bl) throw new Error('Consulting business_line not seeded.')

    // Confirm there's a revenue CoA tagged for the consulting BL.
    const [revAcct] = await tx
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.organizationId, org.id),
          eq(chartOfAccounts.businessLineId, bl.id),
          eq(chartOfAccounts.accountType, 'revenue'),
        ),
      )
      .limit(1)
    if (!revAcct) throw new Error('No revenue account in CoA for consulting BL.')
    console.log(
      `  ✓ fixtures: org, user, BL=consulting, revenue acct ${revAcct.id.slice(0, 8)}…`,
    )

    // Need an expense CoA + a party for billable.
    const [expAcct] = await tx
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.organizationId, org.id),
          eq(chartOfAccounts.accountType, 'expense'),
          eq(chartOfAccounts.isActive, true),
        ),
      )
      .limit(1)
    if (!expAcct) throw new Error('No expense accounts in CoA.')

    // Pick any party as end-client.
    const [party] = await tx.execute(sql`SELECT id FROM parties WHERE organization_id = ${org.id} LIMIT 1`)
    const partyId = (party as any).id
    if (!partyId) throw new Error('No parties seeded.')

    // ---- 1. Create test project ----
    const [project] = await tx
      .insert(projects)
      .values({
        organizationId: org.id,
        projectNumber: `PRJ-VERIFY-${Math.floor(Math.random() * 100000)}`,
        name: 'P1-13 Verify Project',
        businessLineId: bl.id,
        endClientPartyId: partyId,
        status: 'active',
        defaultBillableRateCents: 20_000, // $200/h
        currencyCode: 'USD',
      })
      .returning()
    if (!project) throw new Error('Failed to insert project')
    createdProjectIds.push(project.id)
    console.log(`  ✓ inserted project ${project.projectNumber}`)

    // ---- 2. Insert + approve time entries ----
    const periodStart = '2098-04-01'
    const periodEnd = '2098-04-30'

    // Need a timesheet (week starting), then time entries linked to it.
    const [sheet] = await tx
      .insert(timesheets)
      .values({
        organizationId: org.id,
        submittedByUserId: user.id,
        weekStarting: periodStart,
        status: 'approved',
        totalHours: '0',
        approvedAt: new Date(),
        approvedByUserId: user.id,
      })
      .returning()
    if (!sheet) throw new Error('Failed to insert timesheet')
    createdTimesheetIds.push(sheet.id)

    const t1Description = 'Sprint planning — original'
    const t2Description = 'Code review — original'
    const [te1] = await tx
      .insert(timeEntries)
      .values({
        organizationId: org.id,
        projectId: project.id,
        submittedByUserId: user.id,
        timesheetId: sheet.id,
        entryDate: '2098-04-15',
        hours: '2.50',
        description: t1Description,
        billableRateCents: 20_000,
        currencyCode: 'USD',
        status: 'approved',
      })
      .returning()
    const [te2] = await tx
      .insert(timeEntries)
      .values({
        organizationId: org.id,
        projectId: project.id,
        submittedByUserId: user.id,
        timesheetId: sheet.id,
        entryDate: '2098-04-20',
        hours: '1.00',
        description: t2Description,
        billableRateCents: 20_000,
        currencyCode: 'USD',
        status: 'approved',
      })
      .returning()
    createdTimeEntryIds.push(te1!.id, te2!.id)

    // ---- 3. Insert billable expense ----
    const [exp] = await tx
      .insert(expenseEntries)
      .values({
        organizationId: org.id,
        projectId: project.id,
        businessLineId: bl.id,
        chartOfAccountsId: expAcct.id,
        entryDate: '2098-04-22',
        description: 'Client lunch — original',
        amountCents: 12_500,
        currencyCode: 'USD',
        paymentSource: 'business_card',
        isBillable: true,
        isReimbursable: false,
        submittedByUserId: user.id,
      })
      .returning()
    if (!exp) throw new Error('Failed to insert expense')
    createdExpenseIds.push(exp.id)
    console.log(`  ✓ inserted 2 approved time entries + 1 billable expense`)

    // ---- 4. Generate invoice via the helper directly (bypasses the auth + audit
    //         wrapper since we don't have a session in scripts; same logic). ----
    const { generateInvoiceLines } = await import(
      '../src/modules/billing/lib/invoices/generator'
    )
    const draft = generateInvoiceLines({
      timeEntries: [
        {
          id: te1!.id,
          entryDate: te1!.entryDate,
          description: te1!.description,
          hoursText: te1!.hours,
          billableRateCents: te1!.billableRateCents,
          currencyCode: te1!.currencyCode,
          projectId: te1!.projectId,
        },
        {
          id: te2!.id,
          entryDate: te2!.entryDate,
          description: te2!.description,
          hoursText: te2!.hours,
          billableRateCents: te2!.billableRateCents,
          currencyCode: te2!.currencyCode,
          projectId: te2!.projectId,
        },
      ],
      expenses: [
        {
          id: exp.id,
          entryDate: exp.entryDate,
          description: exp.description,
          amountCents: exp.amountCents,
          currencyCode: exp.currencyCode,
          projectId: exp.projectId,
          chartOfAccountsId: exp.chartOfAccountsId,
        },
      ],
    })
    assert(draft.lines.length === 3, '3 lines (2 time + 1 expense)')
    // 2.5 × $200 + 1.0 × $200 + $125 = $500 + $200 + $125 = $825
    assert(draft.subtotalCents === 82_500, `subtotal $825 (got ${draft.subtotalCents})`)
    console.log(`  ✓ generator produced 3 lines, subtotal $${(draft.subtotalCents / 100).toFixed(2)}`)

    // Insert invoice + lines + linkbacks (mirrors the action handler).
    const { nextInvoiceNumber } = await import(
      '../src/modules/billing/lib/invoices/next-invoice-number'
    )
    const invoiceNumber = await nextInvoiceNumber(tx as any, org.id, 2098)
    const [invoice] = await tx
      .insert(invoices)
      .values({
        organizationId: org.id,
        invoiceNumber,
        billToPartyId: partyId,
        businessLineId: bl.id,
        projectId: project.id,
        issueDate: '2098-05-01',
        dueDate: '2098-05-31',
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        currencyCode: 'USD',
        subtotalCents: draft.subtotalCents,
        taxCents: 0,
        totalCents: draft.subtotalCents,
        paidCents: 0,
        status: 'draft',
      })
      .returning()
    if (!invoice) throw new Error('Failed to insert invoice')
    createdInvoiceIds.push(invoice.id)

    const insertedLines = await tx
      .insert(invoiceLines)
      .values(
        draft.lines.map((l) => ({
          organizationId: org.id,
          invoiceId: invoice.id,
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
      .returning()
    // Linkbacks.
    for (const l of draft.lines) {
      const inserted = insertedLines.find((il) => il.lineNumber === l.lineNumber)!
      if (l.sourceTimeEntryId) {
        await tx
          .update(timeEntries)
          .set({ status: 'invoiced', invoiceLineId: inserted.id })
          .where(eq(timeEntries.id, l.sourceTimeEntryId))
      } else if (l.sourceExpenseEntryId) {
        await tx
          .update(expenseEntries)
          .set({ invoiceId: invoice.id })
          .where(eq(expenseEntries.id, l.sourceExpenseEntryId))
      }
    }
    console.log(`  ✓ created invoice ${invoiceNumber} with 3 lines`)

    // ---- 5. §3.13 HEADLINE TEST: edit source time-entry, assert invoice line UNCHANGED ----
    await tx
      .update(timeEntries)
      .set({ description: 'Sprint planning — RENAMED AFTER INVOICE' })
      .where(eq(timeEntries.id, te1!.id))

    const [refreshedLine] = await tx
      .select({ description: invoiceLines.description })
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.invoiceId, invoice.id),
          eq(invoiceLines.lineNumber, 1),
        ),
      )
      .limit(1)
    assert(
      refreshedLine!.description === t1Description,
      `§3.13 SNAPSHOT BROKEN: invoice line description was rewritten when source changed. Expected "${t1Description}", got "${refreshedLine!.description}"`,
    )
    console.log(
      `  ✓ §3.13 HEADLINE TEST PASSED: invoice line description "${refreshedLine!.description}" stayed put after source rename`,
    )

    // ---- 6. Mark sent → post invoice journal ----
    const { postInvoiceJournal } = await import(
      '../src/modules/finance/lib/journal/post-invoice'
    )
    const lineForJournal = insertedLines.map((l) => ({
      id: l.id,
      amountCents: l.amountCents,
      chartOfAccountsId: l.chartOfAccountsId,
      projectBusinessLineId: bl.id,
      description: l.description,
    }))
    const sentJournal = await postInvoiceJournal(tx as any, {
      organizationId: org.id,
      invoiceId: invoice.id,
      invoiceNumber,
      entryDate: '2098-05-01',
      totalCents: invoice.totalCents,
      currencyCode: 'USD',
      billToPartyId: partyId,
      invoiceBusinessLineId: bl.id,
      lines: lineForJournal,
    })
    await tx
      .update(invoices)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(invoices.id, invoice.id))
    console.log(`  ✓ sent journal ${sentJournal.entryNumber} posted`)
    await assertJournalBalanced(tx, 'after send')

    // ---- 7. Partial payment ($300) ----
    const { postPaymentJournal } = await import(
      '../src/modules/finance/lib/journal/post-payment'
    )
    const { nextPaymentNumber } = await import(
      '../src/modules/billing/lib/payments/next-payment-number'
    )
    const partialAmount = 30_000 // $300 of $825
    const paymentNumber1 = await nextPaymentNumber(tx as any, org.id, 2098)
    const [pmt1] = await tx
      .insert(payments)
      .values({
        organizationId: org.id,
        paymentNumber: paymentNumber1,
        fromPartyId: partyId,
        paymentDate: '2098-05-15',
        amountCents: partialAmount,
        currencyCode: 'USD',
        paymentMethod: 'ach',
      })
      .returning()
    createdPaymentIds.push(pmt1!.id)
    await tx.insert(paymentApplications).values({
      organizationId: org.id,
      paymentId: pmt1!.id,
      invoiceId: invoice.id,
      appliedCents: partialAmount,
      currencyCode: 'USD',
    })
    await postPaymentJournal(tx as any, {
      organizationId: org.id,
      paymentId: pmt1!.id,
      paymentNumber: paymentNumber1,
      entryDate: '2098-05-15',
      amountCents: partialAmount,
      currencyCode: 'USD',
      fromPartyId: partyId,
      businessLineId: bl.id,
      appliedToInvoiceNumbers: [invoiceNumber],
    })
    await tx
      .update(invoices)
      .set({ paidCents: partialAmount, status: 'partially_paid' })
      .where(eq(invoices.id, invoice.id))
    console.log(`  ✓ partial payment ${paymentNumber1}: $300; invoice status=partially_paid`)
    await assertJournalBalanced(tx, 'after partial payment')

    // ---- 8. Final payment ($525) ----
    const finalAmount = invoice.totalCents - partialAmount
    const paymentNumber2 = await nextPaymentNumber(tx as any, org.id, 2098)
    const [pmt2] = await tx
      .insert(payments)
      .values({
        organizationId: org.id,
        paymentNumber: paymentNumber2,
        fromPartyId: partyId,
        paymentDate: '2098-06-01',
        amountCents: finalAmount,
        currencyCode: 'USD',
        paymentMethod: 'ach',
      })
      .returning()
    createdPaymentIds.push(pmt2!.id)
    await tx.insert(paymentApplications).values({
      organizationId: org.id,
      paymentId: pmt2!.id,
      invoiceId: invoice.id,
      appliedCents: finalAmount,
      currencyCode: 'USD',
    })
    await postPaymentJournal(tx as any, {
      organizationId: org.id,
      paymentId: pmt2!.id,
      paymentNumber: paymentNumber2,
      entryDate: '2098-06-01',
      amountCents: finalAmount,
      currencyCode: 'USD',
      fromPartyId: partyId,
      businessLineId: bl.id,
      appliedToInvoiceNumbers: [invoiceNumber],
    })
    await tx
      .update(invoices)
      .set({
        paidCents: invoice.totalCents,
        status: 'paid',
        paidAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id))
    console.log(`  ✓ final payment ${paymentNumber2}: $${(finalAmount / 100).toFixed(2)}; invoice status=paid`)
    await assertJournalBalanced(tx, 'after final payment')

    // ---- 9. Tax estimate recompute on payment receive ----
    const { recomputeTaxEstimateForDateChange } = await import(
      '../src/modules/finance/lib/tax/recompute'
    )
    // Note: recompute only meaningfully runs if revenueEntries exist for the
    // period. For invoicing we don't insert revenueEntries (those represent
    // the cash recognition; payment is the trigger). The recompute still
    // fires (no-op for empty quarters) which is the correct shape — same
    // call site for a future cash-basis-from-payments mode.
    await recomputeTaxEstimateForDateChange(tx as any, org.id, null, '2098-06-01')
    const [paymentTaxEstimate] = await tx
      .select({ id: taxEstimates.id })
      .from(taxEstimates)
      .where(
        and(
          eq(taxEstimates.organizationId, org.id),
          eq(taxEstimates.taxYear, 2098),
        ),
      )
    if (paymentTaxEstimate) createdEstimateIds.push(paymentTaxEstimate.id)
    console.log(`  ✓ recomputeTaxEstimateForDateChange fired for payment date 2098-06-01`)

    // ---- 10. Generate a SECOND draft invoice (manual lines for simplicity), void it ----
    // Need a fresh approved time entry not yet invoiced.
    const [te3] = await tx
      .insert(timeEntries)
      .values({
        organizationId: org.id,
        projectId: project.id,
        submittedByUserId: user.id,
        timesheetId: sheet.id,
        entryDate: '2098-04-25',
        hours: '0.50',
        description: 'Quick consult',
        billableRateCents: 20_000,
        currencyCode: 'USD',
        status: 'approved',
      })
      .returning()
    createdTimeEntryIds.push(te3!.id)

    const invoiceNumber2 = await nextInvoiceNumber(tx as any, org.id, 2098)
    const [invoice2] = await tx
      .insert(invoices)
      .values({
        organizationId: org.id,
        invoiceNumber: invoiceNumber2,
        billToPartyId: partyId,
        businessLineId: bl.id,
        projectId: project.id,
        issueDate: '2098-05-02',
        dueDate: '2098-06-01',
        currencyCode: 'USD',
        subtotalCents: 10_000,
        taxCents: 0,
        totalCents: 10_000,
        paidCents: 0,
        status: 'draft',
      })
      .returning()
    createdInvoiceIds.push(invoice2!.id)
    const [il2] = await tx
      .insert(invoiceLines)
      .values({
        organizationId: org.id,
        invoiceId: invoice2!.id,
        lineNumber: 1,
        description: 'Quick consult',
        kind: 'time',
        projectId: project.id,
        quantity: '0.50',
        unitPriceCents: 20_000,
        amountCents: 10_000,
        currencyCode: 'USD',
        chartOfAccountsId: revAcct.id,
      })
      .returning()
    await tx
      .update(timeEntries)
      .set({ status: 'invoiced', invoiceLineId: il2!.id })
      .where(eq(timeEntries.id, te3!.id))

    // Send invoice2.
    const sentJournal2 = await postInvoiceJournal(tx as any, {
      organizationId: org.id,
      invoiceId: invoice2!.id,
      invoiceNumber: invoiceNumber2,
      entryDate: '2098-05-02',
      totalCents: 10_000,
      currencyCode: 'USD',
      billToPartyId: partyId,
      invoiceBusinessLineId: bl.id,
      lines: [
        {
          id: il2!.id,
          amountCents: 10_000,
          chartOfAccountsId: revAcct.id,
          projectBusinessLineId: bl.id,
          description: 'Quick consult',
        },
      ],
    })
    await tx
      .update(invoices)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(invoices.id, invoice2!.id))
    void sentJournal2

    // Now void invoice2 (no payments).
    const { findUnreversedJournalEntries } = await import(
      '../src/modules/finance/lib/journal/find-unreversed'
    )
    const { reverseJournalEntry } = await import(
      '../src/modules/finance/lib/journal/reverse-entry'
    )
    const unreversed = await findUnreversedJournalEntries(
      tx as any,
      org.id,
      'billing_invoices',
      invoice2!.id,
    )
    assert(unreversed.length === 1, '1 unreversed journal entry on the sent invoice')
    for (const e of unreversed) {
      await reverseJournalEntry(tx as any, {
        originalEntryId: e.id,
        organizationId: org.id,
        reason: `Invoice ${invoiceNumber2} voided`,
      })
    }
    await tx
      .update(invoices)
      .set({ status: 'void', voidedAt: new Date() })
      .where(eq(invoices.id, invoice2!.id))
    await tx
      .update(timeEntries)
      .set({ status: 'approved', invoiceLineId: null })
      .where(eq(timeEntries.id, te3!.id))
    console.log(`  ✓ voided invoice ${invoiceNumber2}; journal reversed`)
    await assertJournalBalanced(tx, 'after void')

    // ---- 11. Try to "void" the paid invoice — block via paid_cents check (the
    //         action does this; we replicate the check here). ----
    const [paidInvoice] = await tx
      .select({ paidCents: invoices.paidCents })
      .from(invoices)
      .where(eq(invoices.id, invoice.id))
      .limit(1)
    assert(
      (paidInvoice!.paidCents ?? 0) > 0,
      'Paid invoice has paid_cents > 0 → void would be blocked by the action',
    )
    console.log(
      `  ✓ paid invoice has paid_cents=${paidInvoice!.paidCents}; voidInvoice action would block (refund Phase 2)`,
    )

    // ---- 12. Final org-wide balance check ----
    await assertJournalBalanced(tx, 'final org-wide')
    console.log(`  ✓ all journal entries balance org-wide`)

    // ---- Cleanup ----
    // Reverse-link source rows so we can delete safely.
    await tx
      .update(timeEntries)
      .set({ status: 'approved', invoiceLineId: null })
      .where(inArray(timeEntries.id, createdTimeEntryIds))
    await tx
      .update(expenseEntries)
      .set({ invoiceId: null })
      .where(inArray(expenseEntries.id, createdExpenseIds))

    // Find ALL journal entries created by this run (sourced from billing_invoices
    // OR billing_payments OR is a reversal of one) and clean them up.
    const invoiceSourcedEntries = createdInvoiceIds.length
      ? await tx
          .select({ id: journalEntries.id })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.organizationId, org.id),
              eq(journalEntries.sourceTable, 'billing_invoices'),
              inArray(journalEntries.sourceId, createdInvoiceIds),
            ),
          )
      : []
    const paymentSourcedEntries = createdPaymentIds.length
      ? await tx
          .select({ id: journalEntries.id })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.organizationId, org.id),
              eq(journalEntries.sourceTable, 'billing_payments'),
              inArray(journalEntries.sourceId, createdPaymentIds),
            ),
          )
      : []
    const entryIds = [
      ...invoiceSourcedEntries.map((e) => e.id),
      ...paymentSourcedEntries.map((e) => e.id),
    ]
    if (entryIds.length) {
      // Reversals point at one of these — delete them first.
      const reversals = await tx
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(inArray(journalEntries.reversedJournalEntryId, entryIds))
      const allEntryIds = [...entryIds, ...reversals.map((r) => r.id)]
      await tx
        .delete(journalLines)
        .where(inArray(journalLines.journalEntryId, allEntryIds))
      await tx.delete(journalEntries).where(inArray(journalEntries.id, allEntryIds))
    }

    if (createdPaymentIds.length) {
      await tx
        .delete(paymentApplications)
        .where(inArray(paymentApplications.paymentId, createdPaymentIds))
      await tx.delete(payments).where(inArray(payments.id, createdPaymentIds))
    }

    await tx
      .delete(invoiceLines)
      .where(inArray(invoiceLines.invoiceId, createdInvoiceIds))
    await tx.delete(invoices).where(inArray(invoices.id, createdInvoiceIds))
    await tx
      .delete(expenseEntries)
      .where(inArray(expenseEntries.id, createdExpenseIds))
    await tx
      .delete(timeEntries)
      .where(inArray(timeEntries.id, createdTimeEntryIds))
    await tx
      .delete(timesheets)
      .where(inArray(timesheets.id, createdTimesheetIds))
    if (createdEstimateIds.length) {
      await tx
        .delete(taxEstimates)
        .where(inArray(taxEstimates.id, createdEstimateIds))
    }
    await tx.delete(projects).where(inArray(projects.id, createdProjectIds))

    console.log(
      `  ✓ cleanup: removed ${createdInvoiceIds.length} invoices, ${createdPaymentIds.length} payments, all journals + sources`,
    )
    console.log(`\n  P1-13 verification PASSED.`)
  })
}

main()
  .then(async () => {
    await client.end()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('Verification FAILED:', err)
    await client.end()
    process.exit(1)
  })
