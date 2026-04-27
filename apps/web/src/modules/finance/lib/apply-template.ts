import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  chartOfAccounts,
  chartOfAccountsTemplates,
  chartOfAccountsTemplateLines,
} from '../schema'

export interface ApplyChartOfAccountsTemplateOptions {
  /**
   * Map of business_line slug → business_line id for the target organization.
   * Used to resolve template lines' `suggested_business_line_match` to a real
   * `business_line_id` on the materialized account.
   *
   * Callers pass this in (rather than the function looking up parties.business_lines
   * itself) to keep the finance module's data-layer dependencies finance-only.
   * Seeds and tenant-onboarding code build the map before calling.
   */
  businessLineIdBySlug?: Record<string, string>
}

export interface ApplyChartOfAccountsTemplateResult {
  inserted: number
  skipped: number
  total: number
}

/**
 * Materializes a CoA template into per-org `finance_chart_of_accounts` rows.
 *
 * Idempotent: rows already present (matched by `(organization_id, account_number)`)
 * are skipped. Safe to re-run; safe to call against an org that already has a
 * partial CoA (only missing accounts are inserted).
 *
 * Two-pass: pass 1 inserts accounts with parent_account_id NULL; pass 2 resolves
 * `parent_account_number` against the just-built (account_number → id) map.
 */
export async function applyChartOfAccountsTemplate(
  organizationId: string,
  templateSlug: string,
  options: ApplyChartOfAccountsTemplateOptions = {},
): Promise<ApplyChartOfAccountsTemplateResult> {
  const businessLineIdBySlug = options.businessLineIdBySlug ?? {}

  const [template] = await db
    .select({ id: chartOfAccountsTemplates.id })
    .from(chartOfAccountsTemplates)
    .where(eq(chartOfAccountsTemplates.slug, templateSlug))
    .limit(1)

  if (!template) {
    throw new Error(`CoA template not found: ${templateSlug}`)
  }

  const lines = await db
    .select()
    .from(chartOfAccountsTemplateLines)
    .where(eq(chartOfAccountsTemplateLines.templateId, template.id))
    .orderBy(chartOfAccountsTemplateLines.displayOrder)

  // Snapshot existing accounts so we can skip duplicates and resolve parents
  // that were inserted in a previous run.
  const existing = await db
    .select({ id: chartOfAccounts.id, accountNumber: chartOfAccounts.accountNumber })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.organizationId, organizationId))

  const accountNumberToId = new Map<string, string>(
    existing.map((row) => [row.accountNumber, row.id]),
  )

  let inserted = 0
  let skipped = 0

  // Pass 1 — insert (parent_account_id null), record id by account_number.
  for (const line of lines) {
    if (accountNumberToId.has(line.accountNumber)) {
      skipped += 1
      continue
    }

    const businessLineId = line.suggestedBusinessLineMatch
      ? (businessLineIdBySlug[line.suggestedBusinessLineMatch] ?? null)
      : null

    const [row] = await db
      .insert(chartOfAccounts)
      .values({
        organizationId,
        accountNumber: line.accountNumber,
        accountName: line.accountName,
        accountType: line.accountType,
        accountSubtype: line.accountSubtype,
        businessLineId,
        description: line.description,
      })
      .returning({ id: chartOfAccounts.id })

    if (!row) {
      throw new Error(`Insert returned no row for account ${line.accountNumber}`)
    }

    accountNumberToId.set(line.accountNumber, row.id)
    inserted += 1
  }

  // Pass 2 — resolve parent_account_id for any line that named a parent_account_number.
  for (const line of lines) {
    if (!line.parentAccountNumber) continue
    const childId = accountNumberToId.get(line.accountNumber)
    const parentId = accountNumberToId.get(line.parentAccountNumber)
    if (!childId || !parentId) continue

    await db
      .update(chartOfAccounts)
      .set({ parentAccountId: parentId })
      .where(
        and(
          eq(chartOfAccounts.organizationId, organizationId),
          eq(chartOfAccounts.id, childId),
        ),
      )
  }

  return { inserted, skipped, total: lines.length }
}
