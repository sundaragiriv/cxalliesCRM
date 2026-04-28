/**
 * P1-10 end-to-end tax-estimates verification.
 *
 * Exercises against the real DB:
 *   1. owner_draws + cash_operating system roles resolve
 *   2. recomputeTaxEstimateForPeriod produces non-zero estimates from real
 *      revenue/expense rows in a quarter
 *   3. UPSERT path: a second recompute updates the same row
 *   4. postTaxPaymentJournal: 4-line journal balances (3 debits + 1 credit)
 *   5. Zero-component skip: if state=0, journal has 3 lines not 4
 *   6. SUM(debits) = SUM(credits) for every entry written
 *
 * Cleans up everything it created. Re-runnable.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  expenseEntries,
  journalEntries,
  journalLines,
  revenueEntries,
  taxEstimates,
} from '../src/modules/finance/schema'
import { organizations, businessLines } from '../src/modules/parties/schema'
import { users } from '../src/modules/auth/schema'
import { chartOfAccounts } from '../src/modules/finance/schema'
import { findSystemAccount } from '../src/modules/finance/lib/system-accounts'
import { recomputeTaxEstimateForPeriod } from '../src/modules/finance/lib/tax/recompute'
import { postTaxPaymentJournal } from '../src/modules/finance/lib/journal/post-tax-payment'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL not set')

const client = postgres(url, { max: 1 })
const db = drizzle(client)

const createdEntryIds: string[] = []
const createdRevenueIds: string[] = []
const createdExpenseIds: string[] = []
let createdEstimateId: string | null = null

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

async function main() {
  await db.transaction(async (tx) => {
    // ---- 0. Locate seeded fixtures ----
    const [org] = await tx
      .select({ id: organizations.id, defaultFilingStatus: organizations.defaultFilingStatus, homeState: organizations.homeState })
      .from(organizations)
      .limit(1)
    if (!org) throw new Error('No organizations seeded.')

    const [bl] = await tx
      .select({ id: businessLines.id })
      .from(businessLines)
      .where(eq(businessLines.organizationId, org.id))
      .limit(1)
    if (!bl) throw new Error('No business_lines seeded.')

    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.organizationId, org.id))
      .limit(1)
    if (!user) throw new Error('No users seeded.')

    const [revAcct] = await tx
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.organizationId, org.id),
          eq(chartOfAccounts.accountType, 'revenue'),
          eq(chartOfAccounts.isActive, true),
        ),
      )
      .limit(1)
    if (!revAcct) throw new Error('No revenue accounts in CoA.')

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

    const ownerDrawsId = await findSystemAccount(tx as any, org.id, 'owner_draws')
    const cashId = await findSystemAccount(tx as any, org.id, 'cash_operating')
    console.log(`  ✓ owner_draws    resolved → ${ownerDrawsId}`)
    console.log(`  ✓ cash_operating resolved → ${cashId}`)

    // ---- 1. Create $25K Q4-2026 revenue + $5K Q4-2026 expense ----
    // Use Q4-2026: tax_rates are seeded for 2026; Q4 (Sep-Dec) is far enough
    // out that the owner is unlikely to have real entries there yet. If the
    // script's cleanup fails midway, the only collateral is a stray
    // tax_estimates row for Q4-2026 which the next mutation auto-recomputes.
    const TEST_YEAR = 2026
    const TEST_QUARTER = 4
    const periodDate = `${TEST_YEAR}-11-15` // mid-Q4

    const [rev] = await tx
      .insert(revenueEntries)
      .values({
        organizationId: org.id,
        entryDate: periodDate,
        businessLineId: bl.id,
        chartOfAccountsId: revAcct.id,
        description: 'P1-10 verification revenue — DELETE ME',
        amountCents: 25_000_00,
        currencyCode: 'USD',
        paymentStatus: 'received',
        receivedAt: new Date(`${periodDate}T12:00:00Z`),
      })
      .returning({ id: revenueEntries.id })
    if (!rev) throw new Error('Failed to insert test revenue')
    createdRevenueIds.push(rev.id)

    const [exp] = await tx
      .insert(expenseEntries)
      .values({
        organizationId: org.id,
        entryDate: periodDate,
        businessLineId: bl.id,
        chartOfAccountsId: expAcct.id,
        description: 'P1-10 verification expense — DELETE ME',
        amountCents: 5_000_00,
        currencyCode: 'USD',
        paymentSource: 'business_card',
        isBillable: false,
        isReimbursable: false,
        submittedByUserId: user.id,
      })
      .returning({ id: expenseEntries.id })
    if (!exp) throw new Error('Failed to insert test expense')
    createdExpenseIds.push(exp.id)

    console.log(`  ✓ inserted $25K received revenue + $5K expense in Q${TEST_QUARTER}-${TEST_YEAR}`)

    // ---- 2. First recompute creates the estimate row ----
    const r1 = await recomputeTaxEstimateForPeriod(tx as any, org.id, TEST_YEAR, TEST_QUARTER)
    createdEstimateId = r1.taxEstimateId
    console.log(
      `  ✓ recompute #1 → estimate ${r1.taxEstimateId} total=${r1.totalEstimateCents}¢`,
    )
    assert(r1.totalEstimateCents > 0, 'first recompute produces non-zero estimate')

    // Verify the row matches what we expect from the inputs.
    const [row1] = await tx
      .select()
      .from(taxEstimates)
      .where(eq(taxEstimates.id, r1.taxEstimateId))
      .limit(1)
    assert(row1!.grossIncomeCents === 25_000_00, 'gross income reflects revenue')
    assert(row1!.deductibleExpensesCents === 5_000_00, 'expenses reflect expense rows')
    assert(row1!.federalEstimateCents != null && row1!.federalEstimateCents > 0, 'federal estimate non-zero')
    assert(row1!.stateEstimateCents != null && row1!.stateEstimateCents > 0, 'NC state estimate non-zero (4.25% on net)')
    assert(
      row1!.selfEmploymentEstimateCents != null && row1!.selfEmploymentEstimateCents > 0,
      'SE estimate non-zero',
    )
    console.log(
      `    breakdown: federal=${row1!.federalEstimateCents}¢ state=${row1!.stateEstimateCents}¢ se=${row1!.selfEmploymentEstimateCents}¢`,
    )

    // ---- 3. Upsert path: insert another expense, recompute again, verify update ----
    const [exp2] = await tx
      .insert(expenseEntries)
      .values({
        organizationId: org.id,
        entryDate: periodDate,
        businessLineId: bl.id,
        chartOfAccountsId: expAcct.id,
        description: 'P1-10 second expense — DELETE ME',
        amountCents: 3_000_00,
        currencyCode: 'USD',
        paymentSource: 'business_card',
        isBillable: false,
        isReimbursable: false,
        submittedByUserId: user.id,
      })
      .returning({ id: expenseEntries.id })
    createdExpenseIds.push(exp2!.id)

    const r2 = await recomputeTaxEstimateForPeriod(tx as any, org.id, TEST_YEAR, TEST_QUARTER)
    assert(r2.taxEstimateId === r1.taxEstimateId, 'upsert returns same row id')
    assert(
      r2.totalEstimateCents < r1.totalEstimateCents,
      'adding expense reduced estimate',
    )
    console.log(
      `  ✓ recompute #2 → same row, total decreased to ${r2.totalEstimateCents}¢ (-$${(r1.totalEstimateCents - r2.totalEstimateCents) / 100})`,
    )

    // ---- 4. Mark paid: post the 4-line journal ----
    const [refreshed] = await tx
      .select()
      .from(taxEstimates)
      .where(eq(taxEstimates.id, r1.taxEstimateId))
      .limit(1)
    const fed = refreshed!.federalEstimateCents ?? 0
    const st = refreshed!.stateEstimateCents ?? 0
    const se = refreshed!.selfEmploymentEstimateCents ?? 0
    const total = fed + st + se

    const journal = await postTaxPaymentJournal(tx as any, {
      organizationId: org.id,
      taxEstimateId: r1.taxEstimateId,
      entryDate: '2027-01-15',
      federalCents: fed,
      stateCents: st,
      seCents: se,
      paymentReference: 'EFTPS test 2026Q4',
      taxYear: TEST_YEAR,
      taxQuarter: TEST_QUARTER,
    })
    createdEntryIds.push(journal.id)
    assert(journal.totalCents === total, 'journal total matches')
    console.log(`  ✓ mark-paid journal ${journal.entryNumber} posted, total=${total}¢`)

    // Verify shape: 4 lines, balanced, 3 debits to owner_draws + 1 credit to cash.
    const lines = await tx
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, journal.id))

    assert(lines.length === 4, `expected 4 lines for tax payment, got ${lines.length}`)
    const debits = lines.reduce((s, l) => s + l.debitCents, 0)
    const credits = lines.reduce((s, l) => s + l.creditCents, 0)
    assert(debits === credits, `journal not balanced: ${debits} vs ${credits}`)
    assert(debits === total, `debit total ${debits} != expected ${total}`)
    console.log(`  ✓ 4-line entry balances: debits=${debits} credits=${credits}`)

    const debitLines = lines.filter((l) => l.debitCents > 0)
    assert(debitLines.length === 3, '3 debit lines (federal/state/SE)')
    assert(
      debitLines.every((l) => l.chartOfAccountsId === ownerDrawsId),
      'all debits hit owner_draws',
    )
    const creditLines = lines.filter((l) => l.creditCents > 0)
    assert(creditLines.length === 1, '1 credit line')
    assert(creditLines[0]!.chartOfAccountsId === cashId, 'credit hits cash_operating')
    console.log(`  ✓ 3 debits → owner_draws; 1 credit → cash_operating`)

    // ---- 5. Skip-zero path: federal-only payment produces 2-line entry ----
    const journalFedOnly = await postTaxPaymentJournal(tx as any, {
      organizationId: org.id,
      taxEstimateId: r1.taxEstimateId,
      entryDate: '2027-01-16',
      federalCents: 100_000,
      stateCents: 0,
      seCents: 0,
      paymentReference: 'federal-only test',
      taxYear: TEST_YEAR,
      taxQuarter: TEST_QUARTER,
    })
    createdEntryIds.push(journalFedOnly.id)

    const fedOnlyLines = await tx
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, journalFedOnly.id))
    assert(fedOnlyLines.length === 2, 'federal-only payment skips zero lines → 2 lines')
    const fedOnlyDebits = fedOnlyLines.reduce((s, l) => s + l.debitCents, 0)
    const fedOnlyCredits = fedOnlyLines.reduce((s, l) => s + l.creditCents, 0)
    assert(fedOnlyDebits === fedOnlyCredits, 'federal-only entry balances')
    console.log(`  ✓ zero-component skip: federal-only → 2 lines, balanced`)

    // ---- 6. Final SUM(debits) === SUM(credits) across all entries written ----
    for (const entryId of createdEntryIds) {
      const [agg] = await tx
        .select({
          debits: sql<string>`COALESCE(SUM(${journalLines.debitCents}), 0)::text`,
          credits: sql<string>`COALESCE(SUM(${journalLines.creditCents}), 0)::text`,
        })
        .from(journalLines)
        .where(eq(journalLines.journalEntryId, entryId))
      assert(
        Number(agg!.debits) === Number(agg!.credits),
        `entry ${entryId} not balanced: ${agg!.debits} vs ${agg!.credits}`,
      )
    }
    console.log(`  ✓ all ${createdEntryIds.length} P1-10 journal entries balance`)

    // ---- Cleanup ----
    const allLines = await tx
      .select({ id: journalLines.id })
      .from(journalLines)
      .where(inArray(journalLines.journalEntryId, createdEntryIds))
    createdLineIds = allLines.map((l) => l.id)

    await tx.delete(journalLines).where(inArray(journalLines.journalEntryId, createdEntryIds))
    await tx.delete(journalEntries).where(inArray(journalEntries.id, createdEntryIds))
    if (createdEstimateId) {
      await tx.delete(taxEstimates).where(eq(taxEstimates.id, createdEstimateId))
    }
    await tx.delete(expenseEntries).where(inArray(expenseEntries.id, createdExpenseIds))
    await tx.delete(revenueEntries).where(inArray(revenueEntries.id, createdRevenueIds))
    console.log(
      `  ✓ cleanup: removed ${createdEntryIds.length} journals, ${createdLineIds.length} lines, 1 estimate, ${createdExpenseIds.length} expenses, ${createdRevenueIds.length} revenue`,
    )

    console.log(`\n  P1-10 verification PASSED.`)
  })
}

let createdLineIds: string[] = []

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
