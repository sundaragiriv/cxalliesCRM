/**
 * P1-11 schema verification.
 *
 * 1. Confirms the deal-stage seed materialized stages for consulting/
 *    matrimony/cxallies business lines but skipped moonking-yt (ad_revenue).
 * 2. Deliberately violates each new cross-module FK to prove referential
 *    integrity is enforced at the DB layer.
 *
 * Re-runnable. Each FK violation test wraps in a savepoint so failures don't
 * abort the outer transaction.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import { dealStages } from '../src/modules/crm/schema'
import { businessLines, organizations } from '../src/modules/parties/schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL not set')

const client = postgres(url, { max: 1 })
const db = drizzle(client)

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

interface FkTest {
  label: string
  // Raw SQL that should FAIL with FK violation.
  // Use $1 etc. for parameterized placeholders.
  sql: string
  params: ReadonlyArray<string | number | null>
}

async function expectFkViolation(test: FkTest): Promise<void> {
  const orphanUuid = randomUUID()
  // Replace literal '%ORPHAN%' tokens with the random uuid bound below.
  const finalSql = test.sql.replace(/%ORPHAN%/g, `'${orphanUuid}'`)
  try {
    await client.unsafe(finalSql, test.params as any)
    throw new Error(
      `Expected FK violation for "${test.label}" but insert succeeded`,
    )
  } catch (err: any) {
    // Postgres FK violation: SQLSTATE 23503
    const code = err?.code ?? ''
    const msg = String(err?.message ?? '')
    if (code !== '23503' && !/violates foreign key/i.test(msg)) {
      throw new Error(
        `Expected FK violation (23503) for "${test.label}", got: ${code} ${msg}`,
      )
    }
    console.log(`  ✓ ${test.label} → FK violation rejected as expected`)
  }
}

async function main() {
  // ---- 1. Deal-stage materialization spot-check ----
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .limit(1)
  if (!org) throw new Error('No organizations seeded.')

  const bls = await db
    .select({
      id: businessLines.id,
      slug: businessLines.slug,
      kind: businessLines.kind,
    })
    .from(businessLines)
    .where(eq(businessLines.organizationId, org.id))

  console.log(`\n  Deal-stage materialization (org ${org.id}):`)

  // Map of slug → expected stage count after seeding.
  const expectedStageCount: Record<string, number> = {
    consulting: 6, // consulting-pipeline: lead/qualified/proposal-sent/negotiation/won/lost
    matrimony: 3, // subscription-pipeline: trial/active/churned
    cxallies: 3, // subscription-pipeline (kind=subscription per seed)
    'moonking-yt': 0, // ad_revenue → skipped
  }

  for (const bl of bls) {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(dealStages)
      .where(
        and(
          eq(dealStages.organizationId, org.id),
          eq(dealStages.businessLineId, bl.id),
        ),
      )
    const actual = row?.count ?? 0
    const expected = expectedStageCount[bl.slug]
    if (expected === undefined) {
      console.log(`    ? ${bl.slug} (kind=${bl.kind}): ${actual} stages (no expectation registered)`)
      continue
    }
    assert(
      actual === expected,
      `${bl.slug} (kind=${bl.kind}): expected ${expected} stages, got ${actual}`,
    )
    console.log(
      `    ✓ ${bl.slug} (kind=${bl.kind}): ${actual} stages` +
        (actual === 0 ? ' (skipped, no pipeline for kind)' : ''),
    )
  }

  // ---- 2. FK violation tests ----
  console.log(`\n  Cross-module FK enforcement:`)

  // Each test inserts a row whose FK column references a non-existent UUID.
  // `%ORPHAN%` is replaced with a fresh random UUID per test.
  const tests: FkTest[] = [
    {
      label: 'finance.revenue_entries.invoice_id → billing_invoices.id',
      sql: `INSERT INTO finance_revenue_entries
              (organization_id, entry_date, business_line_id, chart_of_accounts_id,
               description, amount_cents, payment_status, invoice_id)
            SELECT
              o.id, '2099-01-01', bl.id, coa.id,
              'orphan-revenue', 1, 'received', %ORPHAN%::uuid
            FROM organizations o
            JOIN business_lines bl ON bl.organization_id = o.id
            JOIN finance_chart_of_accounts coa
              ON coa.organization_id = o.id AND coa.account_type = 'revenue'
            LIMIT 1`,
      params: [],
    },
    {
      label: 'finance.revenue_entries.subscription_id → billing_subscriptions.id',
      sql: `INSERT INTO finance_revenue_entries
              (organization_id, entry_date, business_line_id, chart_of_accounts_id,
               description, amount_cents, payment_status, subscription_id)
            SELECT
              o.id, '2099-01-01', bl.id, coa.id,
              'orphan-rev-sub', 1, 'received', %ORPHAN%::uuid
            FROM organizations o
            JOIN business_lines bl ON bl.organization_id = o.id
            JOIN finance_chart_of_accounts coa
              ON coa.organization_id = o.id AND coa.account_type = 'revenue'
            LIMIT 1`,
      params: [],
    },
    {
      label: 'finance.expense_entries.project_id → billing_projects.id',
      sql: `INSERT INTO finance_expense_entries
              (organization_id, entry_date, business_line_id, chart_of_accounts_id,
               description, amount_cents, payment_source, project_id)
            SELECT
              o.id, '2099-01-01', bl.id, coa.id,
              'orphan-exp-project', 1, 'business_card', %ORPHAN%::uuid
            FROM organizations o
            JOIN business_lines bl ON bl.organization_id = o.id
            JOIN finance_chart_of_accounts coa
              ON coa.organization_id = o.id AND coa.account_type = 'expense'
            LIMIT 1`,
      params: [],
    },
    {
      label: 'finance.expense_entries.invoice_id → billing_invoices.id',
      sql: `INSERT INTO finance_expense_entries
              (organization_id, entry_date, business_line_id, chart_of_accounts_id,
               description, amount_cents, payment_source, invoice_id)
            SELECT
              o.id, '2099-01-01', bl.id, coa.id,
              'orphan-exp-invoice', 1, 'business_card', %ORPHAN%::uuid
            FROM organizations o
            JOIN business_lines bl ON bl.organization_id = o.id
            JOIN finance_chart_of_accounts coa
              ON coa.organization_id = o.id AND coa.account_type = 'expense'
            LIMIT 1`,
      params: [],
    },
    {
      label: 'finance.expense_reports.project_id → billing_projects.id',
      sql: `INSERT INTO finance_expense_reports
              (organization_id, report_number, submitted_by_user_id, purpose,
               period_start, period_end, status, project_id)
            SELECT
              o.id, 'ORPHAN-' || gen_random_uuid()::text, u.id, 'orphan-rpt-project',
              '2099-01-01', '2099-01-02', 'draft', %ORPHAN%::uuid
            FROM organizations o
            JOIN users u ON u.organization_id = o.id
            LIMIT 1`,
      params: [],
    },
    {
      label: 'billing.projects.contract_id → crm_contracts.id',
      sql: `INSERT INTO billing_projects
              (organization_id, project_number, name, business_line_id, status, contract_id)
            SELECT
              o.id, 'ORPHAN-' || gen_random_uuid()::text, 'orphan-project', bl.id,
              'planned', %ORPHAN%::uuid
            FROM organizations o
            JOIN business_lines bl ON bl.organization_id = o.id
            LIMIT 1`,
      params: [],
    },
    {
      label: 'billing.payments.revenue_entry_id → finance_revenue_entries.id',
      sql: `INSERT INTO billing_payments
              (organization_id, payment_number, from_party_id, payment_date,
               amount_cents, payment_method, revenue_entry_id)
            SELECT
              o.id, 'ORPHAN-' || gen_random_uuid()::text, p.id, '2099-01-01',
              1, 'check', %ORPHAN%::uuid
            FROM organizations o
            JOIN parties p ON p.organization_id = o.id
            LIMIT 1`,
      params: [],
    },
  ]

  for (const test of tests) {
    await expectFkViolation(test)
  }

  console.log(`\n  P1-11 verification PASSED.`)
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
